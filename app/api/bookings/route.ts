import { NextResponse } from "next/server";
import {
  AppointmentStatus,
  Role,
  SlotStatus,
} from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { apiError, getActor, isStaff } from "@/lib/booking-server";

/**
 * Bookings.
 *
 *  POST   { slotId }        → book a free slot (atomic, race-safe).
 *  DELETE { appointmentId } → cancel; frees the slot back to `free`.
 *
 * Booking is ONLINE-ONLY (no offline queue) to avoid double-booking. The
 * race is closed by a conditional updateMany inside the transaction, NOT by a
 * read-then-write.
 */

/** Thrown inside the transaction to map to a clean HTTP response. */
class BookingError extends Error {
  constructor(
    public httpStatus: number,
    public code: "not_found" | "slot_taken" | "validation",
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

  try {
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

      // 3) Create the appointment (confirmed) in the SAME transaction.
      const appointment = await tx.appointment.create({
        data: {
          date: slot.startsAt,
          status: AppointmentStatus.confirmed,
          patientId,
          doctorId: slot.doctorId,
        },
        select: { id: true, date: true, doctorId: true },
      });

      // 4) Atomic claim. Only succeeds if the slot is STILL free. If a
      //    concurrent booking won, count === 0 → throw → whole tx (incl. the
      //    appointment above) rolls back. No orphan appointment, no double book.
      const claim = await tx.availabilitySlot.updateMany({
        where: { id: slotId, status: SlotStatus.free },
        data: { status: SlotStatus.booked, appointmentId: appointment.id },
      });
      if (claim.count !== 1) {
        throw new BookingError(409, "slot_taken", "Слот уже зайнято");
      }

      return { appointmentId: appointment.id, startsAt: slot.startsAt.toISOString() };
    });

    return NextResponse.json(
      { ok: true, ...result },
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/bookings failed", err);
    return apiError(500, "server", "Не вдалося скасувати запис");
  }
}
