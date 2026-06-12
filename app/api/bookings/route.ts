import { NextResponse } from "next/server";
import {
  AppointmentStatus,
  Role,
  SlotStatus,
} from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { apiError, getActor, isStaff } from "@/lib/booking-server";
import {
  createNotification,
  notifyManagersOfNewBooking,
} from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Bookings.
 *
 *  POST   { slotId }        → book a free slot. Creates a PENDING appointment
 *                             and atomically claims the slot (booked) so nobody
 *                             else can take the time while it's under review.
 *  DELETE { appointmentId } → cancel; frees the slot back to `free`.
 *
 * Booking is ONLINE-ONLY (no offline queue) to avoid double-booking. The
 * race is closed by a conditional updateMany inside the transaction, NOT by a
 * read-then-write.
 *
 * SPAM GUARDS (env-overridable):
 *  - MAX_ACTIVE_APPOINTMENTS: cap on simultaneous active (pending/confirmed,
 *    future) appointments per patient — counted INSIDE the booking transaction.
 *  - rate limiting: in-memory per-user (+ looser per-IP) attempt cap (see
 *    lib/rate-limit; per-process only).
 */

const MAX_ACTIVE_APPOINTMENTS = Number(
  process.env.MAX_ACTIVE_APPOINTMENTS ?? 4,
);
const BOOKING_RATE_LIMIT = Number(process.env.BOOKING_RATE_LIMIT ?? 5);
const BOOKING_RATE_WINDOW_MS = Number(
  process.env.BOOKING_RATE_WINDOW_MS ?? 60_000,
);

/** Thrown inside the transaction to map to a clean HTTP response. */
class BookingError extends Error {
  constructor(
    public httpStatus: number,
    public code: "not_found" | "slot_taken" | "validation" | "past" | "limit",
    message: string,
  ) {
    super(message);
  }
}

// ─── POST: book ────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "validation", "Невалідний JSON");
  }

  const { slotId } = (body ?? {}) as { slotId?: string };
  if (!slotId) return apiError(400, "validation", "slotId є обовʼязковим");

  // Rate limit booking attempts: per-user (primary) + looser per-IP. In-memory,
  // per-process (see lib/rate-limit) — swap for Redis to scale.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userRl = rateLimit(
    `booking:user:${actor.userId}`,
    BOOKING_RATE_LIMIT,
    BOOKING_RATE_WINDOW_MS,
  );
  const ipRl = rateLimit(
    `booking:ip:${ip}`,
    BOOKING_RATE_LIMIT * 4,
    BOOKING_RATE_WINDOW_MS,
  );
  if (!userRl.ok || !ipRl.ok) {
    const retry = Math.max(userRl.retryAfterSec, ipRl.retryAfterSec);
    return NextResponse.json(
      {
        error: "Забагато спроб бронювання. Спробуйте трохи згодом.",
        code: "rate_limited",
      },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }

  try {
    // Single "now" reused by the read-side guard and the atomic claim below,
    // so they agree. Comparison is by moment (UTC), not by calendar day.
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // 1) Resolve the patient. A Google-only user may have no Patient yet —
      //    create one from the User's name/email, phone stays NULL (nullable).
      //    Linking User.patientId means future requests skip this branch (the
      //    JWT picks it up on next sign-in).
      let patientId = actor.patientId;
      if (!patientId) {
        if (!actor.email) {
          throw new BookingError(
            400,
            "validation",
            "Профіль без email — бронювання неможливе",
          );
        }
        const patient = await tx.patient.upsert({
          where: { email: actor.email },
          update: {},
          create: {
            name: actor.name ?? actor.email,
            email: actor.email,
            phone: null, // nullable — do NOT force a NOT NULL column to null
          },
          select: { id: true },
        });
        patientId = patient.id;
        await tx.user.update({
          where: { id: actor.userId },
          data: { patientId },
        });
      }

      // 2) Read the slot for its doctor + start time. This read does NOT decide
      //    the booking — the conditional updateMany below does. So a stale read
      //    can't cause a double-book.
      const slot = await tx.availabilitySlot.findUnique({
        where: { id: slotId },
        select: { id: true, doctorId: true, startsAt: true, status: true },
      });
      if (!slot) {
        throw new BookingError(404, "not_found", "Слот не знайдено");
      }
      if (slot.status !== SlotStatus.free) {
        throw new BookingError(409, "slot_taken", "Слот уже зайнято");
      }
      // Past slots can't be booked. This read-side check gives a clear message;
      // the atomic claim below ALSO guards `startsAt >= now` so the rule can't
      // be bypassed by a race.
      if (slot.startsAt < now) {
        throw new BookingError(409, "past", "Цей час уже минув");
      }

      // 2b) Anti-spam: cap simultaneous ACTIVE (pending/confirmed, future)
      //     appointments. Counted INSIDE the transaction so parallel requests
      //     can't both slip past the limit (ReadCommitted leaves a tiny window
      //     of +1 under heavy concurrency — acceptable; the rate limiter and
      //     1-slot-1-booking guard cover the rest).
      const activeCount = await tx.appointment.count({
        where: {
          patientId,
          status: {
            in: [AppointmentStatus.pending, AppointmentStatus.confirmed],
          },
          date: { gte: now },
        },
      });
      if (activeCount >= MAX_ACTIVE_APPOINTMENTS) {
        throw new BookingError(
          409,
          "limit",
          "Досягнуто ліміт активних записів. Дочекайтесь прийому або скасуйте наявний.",
        );
      }

      // 3) Create the appointment as PENDING (awaiting doctor/staff confirm)
      //    in the SAME transaction.
      const appointment = await tx.appointment.create({
        data: {
          date: slot.startsAt,
          status: AppointmentStatus.pending,
          patientId,
          doctorId: slot.doctorId,
        },
        select: { id: true, date: true, doctorId: true },
      });

      // 4) Atomic claim. Only succeeds if the slot is STILL free AND not in the
      //    past. The `startsAt >= now` condition lives in the SAME where as the
      //    status guard, so a past slot can never be claimed. If a concurrent
      //    booking won, count === 0 → throw → whole tx (incl. the appointment
      //    above) rolls back. No orphan appointment, no double book.
      const claim = await tx.availabilitySlot.updateMany({
        where: { id: slotId, status: SlotStatus.free, startsAt: { gte: now } },
        data: { status: SlotStatus.booked, appointmentId: appointment.id },
      });
      if (claim.count !== 1) {
        throw new BookingError(409, "slot_taken", "Слот уже зайнято");
      }

      return {
        appointmentId: appointment.id,
        startsAt: slot.startsAt.toISOString(),
        doctorId: appointment.doctorId,
        patientId,
        date: appointment.date,
      };
    });

    // Notify the owning doctor + staff/admin ONLY for bookings made for TODAY
    // (clinic TZ). Fired AFTER the commit, best-effort — a notification failure
    // must not fail the booking, and a rolled-back tx never reaches here.
    void notifyManagersOfNewBooking({
      doctorId: result.doctorId,
      patientId: result.patientId,
      date: result.date,
    }).catch((e) => console.error("notify (new booking) failed", e));

    return NextResponse.json(
      {
        ok: true,
        appointmentId: result.appointmentId,
        startsAt: result.startsAt,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof BookingError) {
      return apiError(err.httpStatus, err.code, err.message);
    }
    console.error("POST /api/bookings failed", err);
    return apiError(500, "server", "Не вдалося забронювати");
  }
}

// ─── DELETE: cancel ─────────────────────────────────────────────────────────────

export async function DELETE(request: Request) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "validation", "Невалідний JSON");
  }

  const { appointmentId } = (body ?? {}) as { appointmentId?: string };
  if (!appointmentId) {
    return apiError(400, "validation", "appointmentId є обовʼязковим");
  }

  try {
    const appt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, patientId: true, doctorId: true, status: true },
    });
    if (!appt) return apiError(404, "not_found", "Запис не знайдено");

    // Authorize: own patient, staff/admin, or the owning doctor.
    const isOwnPatient =
      actor.patientId != null && actor.patientId === appt.patientId;
    const isOwningDoctor =
      actor.role === Role.DOCTOR && actor.ownDoctorId === appt.doctorId;
    if (!isOwnPatient && !isStaff(actor.role) && !isOwningDoctor) {
      return apiError(403, "forbidden", "Немає прав скасувати цей запис");
    }

    // Cancel + free the slot atomically. Freeing clears appointmentId so the
    // slot can be re-booked by anyone. updateMany is a no-op (count 0) if the
    // appointment had no linked slot — that's fine.
    await prisma.$transaction([
      prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.cancelled },
      }),
      prisma.availabilitySlot.updateMany({
        where: { appointmentId },
        data: { status: SlotStatus.free, appointmentId: null },
      }),
    ]);

    // Notify the patient that their appointment was cancelled (covers the
    // staff/doctor-initiated path). Best-effort — never fail the cancel.
    try {
      const owner = await prisma.user.findFirst({
        where: { patientId: appt.patientId },
        select: { id: true },
      });
      if (owner) {
        await createNotification({
          userId: owner.id,
          type: "appointment_status",
          title: "Запис скасовано",
          body: "Ваш запис було скасовано.",
          link: "/my/appointments",
        });
      }
    } catch (e) {
      console.error("notify (booking cancel) failed", e);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/bookings failed", err);
    return apiError(500, "server", "Не вдалося скасувати запис");
  }
}
