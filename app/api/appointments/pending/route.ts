import { NextResponse } from "next/server";
import { AppointmentStatus, Role } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { apiError, canManageDoctor, getActor, isStaff } from "@/lib/booking-server";
import type { ManagerAppointment } from "@/lib/appointments-manage";

/**
 * GET /api/appointments/pending?doctorId — the UPCOMING PENDING queue for a
 * manager (owner DOCTOR or STAFF/ADMIN). Drives the confirm/reject UI.
 *
 * Server-side role: STAFF/ADMIN may pass any doctorId; a DOCTOR is forced to
 * their own Doctor row regardless of the query param.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role) && actor.role !== Role.DOCTOR) {
    return apiError(403, "forbidden", "Лише для персоналу");
  }

  const { searchParams } = new URL(request.url);
  let doctorId = searchParams.get("doctorId");

  if (actor.role === Role.DOCTOR) {
    if (!actor.ownDoctorId) return NextResponse.json<ManagerAppointment[]>([]);
    doctorId = actor.ownDoctorId;
  }
  if (!doctorId) return apiError(400, "validation", "doctorId є обовʼязковим");
  if (!canManageDoctor(actor, doctorId)) {
    return apiError(403, "forbidden", "Немає прав на цей розклад");
  }

  try {
    const rows = await prisma.appointment.findMany({
      where: {
        doctorId,
        status: AppointmentStatus.pending,
        date: { gte: new Date() },
      },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        status: true,
        patient: { select: { name: true, phone: true } },
      },
    });

    const out: ManagerAppointment[] = rows.map((a) => ({
      id: a.id,
      date: a.date.toISOString(),
      status: a.status,
      patientName: a.patient.name,
      patientPhone: a.patient.phone,
    }));
    return NextResponse.json<ManagerAppointment[]>(out);
  } catch (err) {
    console.error("GET /api/appointments/pending failed", err);
    return apiError(500, "server", "Не вдалося завантажити записи");
  }
}
