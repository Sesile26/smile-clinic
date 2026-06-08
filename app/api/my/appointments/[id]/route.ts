import { NextResponse } from "next/server";
import { AppointmentStatus, SlotStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { apiError, getActor } from "@/lib/booking-server";
import type { MyAppointment } from "@/lib/my-appointments";

/**
 * PATCH /api/my/appointments/[id] — patient cancels their OWN, FUTURE visit.
 *
 * SECURITY / RULES (all server-side):
 *  - must be authenticated; appointment.patientId must equal the session's
 *    patientId (can't cancel someone else's);
 *  - only an UPCOMING visit (date >= now) that is pending/confirmed;
 *  - cancelling frees the linked AvailabilitySlot back to `free` (clears
 *    appointmentId) IN THE SAME TRANSACTION, so the slot becomes bookable again.
 *
 * Body currently only supports { status: "cancelled" } — the single action a
 * patient may perform on their own appointment.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");
  if (!actor.patientId) {
    return apiError(403, "forbidden", "Профіль без записів");
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "validation", "Невалідний JSON");
  }
  if ((body as { status?: string })?.status !== "cancelled") {
    return apiError(400, "validation", "Підтримується лише скасування");
  }

  try {
    const appt = await prisma.appointment.findUnique({
      where: { id },
      select: { id: true, patientId: true, date: true, status: true },
    });
    if (!appt) return apiError(404, "not_found", "Запис не знайдено");

    // Ownership — never reveal/act on another patient's appointment.
    if (appt.patientId !== actor.patientId) {
      return apiError(403, "forbidden", "Це не ваш запис");
    }
    // Past visits can't be cancelled (compared by moment, UTC).
    if (appt.date.getTime() < Date.now()) {
      return apiError(409, "past", "Минулий запис не можна скасувати");
    }
    // Only an active visit can be cancelled.
    if (
      appt.status !== AppointmentStatus.pending &&
      appt.status !== AppointmentStatus.confirmed
    ) {
      return apiError(409, "validation", "Цей запис не можна скасувати");
    }

    // Cancel + free the slot atomically (mirrors DELETE /api/bookings).
    await prisma.$transaction([
      prisma.appointment.update({
        where: { id },
        data: { status: AppointmentStatus.cancelled },
      }),
      prisma.availabilitySlot.updateMany({
        where: { appointmentId: id },
        data: { status: SlotStatus.free, appointmentId: null },
      }),
    ]);

    const updated = await prisma.appointment.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        date: true,
        status: true,
        doctor: { select: { name: true, specialty: true } },
      },
    });
    return NextResponse.json<MyAppointment>({
      id: updated.id,
      date: updated.date.toISOString(),
      status: updated.status,
      doctorName: updated.doctor.name,
      doctorSpecialty: updated.doctor.specialty,
    });
  } catch (err) {
    console.error("PATCH /api/my/appointments/[id] failed", err);
    return apiError(500, "server", "Не вдалося скасувати запис");
  }
}
