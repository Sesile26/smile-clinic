import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  AppointmentStatus,
  Role,
  SlotStatus,
} from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { apiError, canManageDoctor, getActor, isStaff } from "@/lib/booking-server";
import {
  createNotification,
  notifyManagersOfNewBooking,
} from "@/lib/notifications";

/**
 * POST /api/admin/appointments/manual — staff/admin (any doctor) or a DOCTOR
 * (their own calendar only) records a patient onto a free slot by hand.
 *
 * DIFFERENCES vs patient self-booking (/api/bookings):
 *  • status = CONFIRMED immediately (a trusted staff action — no pending review);
 *  • NO active-appointment limit and NO rate limit (those guard against patient
 *    spam, not trusted staff);
 *  • the patient is chosen (existing) or created on the fly WITHOUT a User
 *    account ("картка без акаунта").
 * Everything else matches: the slot is claimed atomically inside ONE transaction
 * (updateMany where status=free AND startsAt>=now → booked + appointmentId), so a
 * past slot can't be claimed and two requests can't double-book.
 */

const PHONE_RE = /^\+380\d{9}$/;

/** Thrown inside the transaction → mapped to an HTTP response. `patient` is set
 *  when a new patient's phone already belongs to an existing card. */
class ManualError extends Error {
  constructor(
    public httpStatus: number,
    public code: string,
    message: string,
    public patient?: { id: string; name: string; phone: string | null },
  ) {
    super(message);
  }
}

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role) && actor.role !== Role.DOCTOR) {
    return apiError(403, "forbidden", "Лише для персоналу");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "validation", "Невалідний JSON");
  }

  const b = (body ?? {}) as {
    slotId?: string;
    existingPatientId?: string;
    newPatient?: { name?: unknown; phone?: unknown; email?: unknown };
  };

  if (!b.slotId) return apiError(400, "validation", "slotId є обовʼязковим");

  const hasExisting =
    typeof b.existingPatientId === "string" && b.existingPatientId.trim() !== "";
  const hasNew = !!b.newPatient;
  if (hasExisting === hasNew) {
    return apiError(
      400,
      "validation",
      "Вкажіть наявного пацієнта АБО дані нового",
    );
  }

  // Validate the new-patient payload up front.
  let newPatient: { name: string; phone: string; email: string } | null = null;
  if (hasNew) {
    const nd = b.newPatient!;
    const name = typeof nd.name === "string" ? nd.name.trim() : "";
    const phone = typeof nd.phone === "string" ? nd.phone.replace(/\s/g, "") : "";
    const emailRaw = typeof nd.email === "string" ? nd.email.trim() : "";
    if (name.length < 2) return apiError(400, "validation", "Вкажіть імʼя пацієнта");
    if (!PHONE_RE.test(phone)) {
      return apiError(400, "validation", "Телефон у форматі +380XXXXXXXXX");
    }
    if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return apiError(400, "validation", "Невалідний email");
    }
    // email is NOT NULL @unique in the schema; with no real email we derive a
    // unique placeholder from the (unique) phone. The card stays account-less.
    const email = emailRaw || `${phone.replace(/\D/g, "")}@no-email.smileclinic.local`;
    newPatient = { name, phone, email };
  }

  try {
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // 1) Resolve the slot (doctor + start). The atomic claim below — not this
      //    read — decides the booking, so a stale read can't double-book.
      const slot = await tx.availabilitySlot.findUnique({
        where: { id: b.slotId },
        select: { id: true, doctorId: true, startsAt: true, status: true },
      });
      if (!slot) throw new ManualError(404, "not_found", "Слот не знайдено");

      // 2) Permission: staff/admin → any doctor; a DOCTOR → only their own slots.
      if (!canManageDoctor(actor, slot.doctorId)) {
        throw new ManualError(403, "forbidden", "Можна записувати лише у свої слоти");
      }

      if (slot.status !== SlotStatus.free) {
        throw new ManualError(409, "slot_taken", "Слот уже зайнято");
      }
      if (slot.startsAt < now) {
        throw new ManualError(409, "past", "Цей час уже минув");
      }

      // 3) Resolve the patient.
      let patientId: string;
      if (hasExisting) {
        const p = await tx.patient.findUnique({
          where: { id: b.existingPatientId!.trim() },
          select: { id: true },
        });
        if (!p) throw new ManualError(404, "not_found", "Пацієнта не знайдено");
        patientId = p.id;
      } else {
        // New card. Phone is @unique — if it already belongs to someone, point
        // the UI at that card instead of creating a duplicate.
        const existing = await tx.patient.findUnique({
          where: { phone: newPatient!.phone },
          select: { id: true, name: true, phone: true },
        });
        if (existing) {
          throw new ManualError(
            409,
            "phone_exists",
            `Пацієнт із номером ${newPatient!.phone} вже існує: ${existing.name}`,
            existing,
          );
        }
        const created = await tx.patient.create({
          data: {
            name: newPatient!.name,
            phone: newPatient!.phone,
            email: newPatient!.email,
          },
          select: { id: true },
        });
        patientId = created.id;
      }

      // 4) Create the appointment as CONFIRMED (manual = no pending review).
      const appointment = await tx.appointment.create({
        data: {
          date: slot.startsAt,
          status: AppointmentStatus.confirmed,
          patientId,
          doctorId: slot.doctorId,
        },
        select: { id: true, date: true, doctorId: true },
      });

      // 5) Atomic claim — only if STILL free AND not past. count !== 1 → roll back.
      const claim = await tx.availabilitySlot.updateMany({
        where: { id: slot.id, status: SlotStatus.free, startsAt: { gte: now } },
        data: { status: SlotStatus.booked, appointmentId: appointment.id },
      });
      if (claim.count !== 1) {
        throw new ManualError(409, "slot_taken", "Слот уже зайнято");
      }

      return {
        appointmentId: appointment.id,
        startsAt: slot.startsAt.toISOString(),
        doctorId: appointment.doctorId,
        patientId,
        date: appointment.date,
      };
    });

    // Notify managers (owner doctor + staff/admin) for TODAY bookings — same
    // mechanism as online, flagged confirmed. Best-effort, post-commit.
    void notifyManagersOfNewBooking({
      doctorId: result.doctorId,
      patientId: result.patientId,
      date: result.date,
      confirmed: true,
    }).catch((e) => console.error("notify (manual booking) failed", e));

    // If the patient has a User account, tell them too. No account → nobody to
    // notify, which is fine.
    void (async () => {
      try {
        const owner = await prisma.user.findFirst({
          where: { patientId: result.patientId },
          select: { id: true },
        });
        if (owner) {
          const when = new Intl.DateTimeFormat("uk-UA", {
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Kyiv",
          }).format(result.date);
          await createNotification({
            userId: owner.id,
            type: "appointment_status",
            title: "Вас записано на прийом",
            body: `Вас записано на ${when}.`,
            link: "/my/appointments",
          });
        }
      } catch (e) {
        console.error("notify (manual booking patient) failed", e);
      }
    })();

    return NextResponse.json(
      { ok: true, appointmentId: result.appointmentId, startsAt: result.startsAt },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ManualError) {
      if (err.code === "phone_exists") {
        return NextResponse.json(
          { error: err.message, code: err.code, patient: err.patient },
          { status: err.httpStatus },
        );
      }
      // codes here are all valid ApiErrorCode values
      return apiError(
        err.httpStatus,
        err.code as Parameters<typeof apiError>[1],
        err.message,
      );
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Unique race backstop (phone or email).
      const target = String(err.meta?.target ?? "");
      if (target.includes("email")) {
        return apiError(409, "validation", "Цей email вже використовується");
      }
      return apiError(409, "slot_taken", "Пацієнт із таким номером уже існує");
    }
    console.error("POST /api/admin/appointments/manual failed", err);
    return apiError(500, "server", "Не вдалося створити запис");
  }
}
