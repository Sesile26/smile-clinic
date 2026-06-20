import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, canManageDoctor, getActor } from "@/lib/booking-server";
import type { BookedSlotDetail } from "@/lib/booking-types";

/**
 * GET /api/slots/[id]/appointment — details of the appointment occupying a
 * booked slot, for the manage popup.
 *
 * SECURITY: the patient's name/phone are returned ONLY to a caller allowed to
 * manage this slot's doctor — STAFF/ADMIN for anyone, a DOCTOR for their own
 * doctor row (canManageDoctor, re-checked server-side). A doctor probing
 * another doctor's slot id gets 403; an unbooked/unknown slot gets 404. Nothing
 * leaks before the access check.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");

  const { id } = await params;

  try {
    const slot = await prisma.availabilitySlot.findUnique({
      where: { id },
      select: {
        doctorId: true,
        startsAt: true,
        doctor: { select: { name: true } },
        appointment: {
          select: {
            id: true,
            status: true,
            patient: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    });

    if (!slot) return apiError(404, "not_found", "Слот не знайдено");
    // Authorize on the slot's doctor BEFORE returning any patient data.
    if (!canManageDoctor(actor, slot.doctorId)) {
      return apiError(403, "forbidden", "Немає доступу");
    }
    if (!slot.appointment) {
      return apiError(404, "not_found", "Слот не зайнятий");
    }

    const a = slot.appointment;
    return NextResponse.json<BookedSlotDetail>({
      appointmentId: a.id,
      status: a.status,
      date: slot.startsAt.toISOString(),
      doctorId: slot.doctorId,
      doctorName: slot.doctor.name,
      patientId: a.patient.id,
      patientName: a.patient.name,
      patientPhone: a.patient.phone,
    });
  } catch (err) {
    console.error("GET /api/slots/[id]/appointment failed", err);
    return apiError(500, "server", "Не вдалося завантажити деталі запису");
  }
}
