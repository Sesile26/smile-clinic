import { NextResponse } from "next/server";
import { AppointmentStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { apiError, canManageDoctor, getActor } from "@/lib/booking-server";
import { createNotification } from "@/lib/notifications";

/**
 * PATCH /api/appointments/[id]/confirm — confirm a PENDING appointment.
 * Allowed only for the slot's owning DOCTOR or STAFF/ADMIN (checked server-side
 * via canManageDoctor). Notifies the patient on success.
 */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");

  const { id } = await params;
  try {
    const appt = await prisma.appointment.findUnique({
      where: { id },
      select: { id: true, doctorId: true, patientId: true, status: true },
    });
    if (!appt) return apiError(404, "not_found", "Запис не знайдено");
    if (!canManageDoctor(actor, appt.doctorId)) {
      return apiError(403, "forbidden", "Немає прав підтверджувати цей запис");
    }
    if (appt.status !== AppointmentStatus.pending) {
      return apiError(409, "validation", "Запис уже оброблено");
    }

    await prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.confirmed },
    });

    // Notify the patient. Best-effort.
    try {
      const owner = await prisma.user.findFirst({
        where: { patientId: appt.patientId },
        select: { id: true },
      });
      if (owner) {
        await createNotification({
          userId: owner.id,
          type: "appointment_status",
          title: "Ваш запис підтверджено",
          body: "Лікар підтвердив ваш візит.",
          link: "/my/appointments",
        });
      }
    } catch (e) {
      console.error("notify (confirm) failed", e);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/appointments/[id]/confirm failed", err);
    return apiError(500, "server", "Не вдалося підтвердити запис");
  }
}
