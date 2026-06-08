import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, getActor } from "@/lib/booking-server";
import type { MyAppointment } from "@/lib/my-appointments";

/**
 * GET /api/my/appointments — the CURRENT user's appointments only.
 *
 * SECURITY: filtered server-side by the session's patientId. A user with no
 * linked Patient record (e.g. staff/doctor) gets an empty list — never another
 * patient's data. Times are UTC ISO; the client renders them in local time and
 * splits into upcoming (date >= now) / past (date < now).
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");

  // No patient profile → nothing of one's own to show.
  if (!actor.patientId) return NextResponse.json<MyAppointment[]>([]);

  try {
    const rows = await prisma.appointment.findMany({
      where: { patientId: actor.patientId },
      orderBy: { date: "desc" },
      select: {
        id: true,
        date: true,
        status: true,
        doctor: { select: { name: true, specialty: true } },
      },
    });

    const out: MyAppointment[] = rows.map((a) => ({
      id: a.id,
      date: a.date.toISOString(),
      status: a.status,
      doctorName: a.doctor.name,
      doctorSpecialty: a.doctor.specialty,
    }));
    return NextResponse.json<MyAppointment[]>(out);
  } catch (err) {
    console.error("GET /api/my/appointments failed", err);
    return apiError(500, "server", "Не вдалося завантажити записи");
  }
}
