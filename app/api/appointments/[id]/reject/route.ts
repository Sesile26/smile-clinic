import { NextResponse } from "next/server";
import { AppointmentStatus, SlotStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { apiError, canManageDoctor, getActor } from "@/lib/booking-server";
import { createNotification } from "@/lib/notifications";

/**
 * PATCH /api/appointments/[id]/reject — reject an appointment (pending or
 * confirmed) → status CANCELLED and the linked slot is freed back to `free` in
 * the SAME transaction so the time becomes bookable again.
 * Allowed only for the slot's owning DOCTOR or STAFF/ADMIN. Notifies the patient.
 * Optional { reason } is appended to the notification.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");

  const { id } = await params;

  let reason = "";
  try {
    const body = (await request.json()) as { reason?: string };
    if (typeof body?.reason === "string") reason = body.reason.trim().slice(0, 200);
  } catch {
    /* body is optional */
  }

  try {
    const appt = await prisma.appointment.findUnique({
      where: { id },
      select: { id: true, doctorId: true, patientId: true, status: true },
    });
    if (!appt) return apiError(404, "not_found", "Запис не знайдено");
    if (!canManageDoctor(actor, appt.doctorId)) {
      return apiError(403, "forbidden", "Немає прав відхиляти цей запис");
    }
    if (
      appt.status !== AppointmentStatus.pending &&
      appt.status !== AppointmentStatus.confirmed
    ) {
      return apiError(409, "validation", "Запис уже оброблено");
    }

    // Cancel + free the slot atomically (mirrors the cancel path).
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

    try {
      const owner = await prisma.user.findFirst({
        where: { patientId: appt.patientId },
        select: { id: true },
      });
      if (owner) {
        await createNotification({
          userId: owner.id,
          type: "appointment_status",
          title: "Ваш запис відхилено",
          body: reason || "На жаль, лікар не зміг підтвердити цей візит.",
          link: "/my/appointments",
        });
      }
    } catch (e) {
      console.error("notify (reject) failed", e);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/appointments/[id]/reject failed", err);
    return apiError(500, "server", "Не вдалося відхилити запис");
  }
}
