import { NextResponse } from "next/server";
import { AppointmentStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { apiError, getActor } from "@/lib/booking-server";
import {
  PAST_PAGE_SIZE,
  type MyAppointment,
  type MyAppointmentsPage,
} from "@/lib/my-appointments";

/**
 * GET /api/my/appointments?page&pageSize — the CURRENT user's appointments.
 *
 * Returns ALL upcoming visits (pending/confirmed, dated now-or-later) plus ONE
 * offset page of history (everything else: done, cancelled, or past-dated),
 * newest first. The upcoming/past split mirrors the UI rule (isUpcoming).
 *
 * SECURITY: filtered server-side by the session's patientId — a user with no
 * linked Patient (staff/doctor) gets empty lists, never another patient's data.
 */

const ACTIVE = [AppointmentStatus.pending, AppointmentStatus.confirmed];
const SELECT = {
  id: true,
  date: true,
  status: true,
  doctor: { select: { name: true, specialty: { select: { name: true } } } },
} as const;

type Row = {
  id: string;
  date: Date;
  status: MyAppointment["status"];
  doctor: { name: string; specialty: { name: string } | null };
};
const toApi = (a: Row): MyAppointment => ({
  id: a.id,
  date: a.date.toISOString(),
  status: a.status,
  doctorName: a.doctor.name,
  doctorSpecialty: a.doctor.specialty?.name ?? null,
});

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");

  const { searchParams } = new URL(request.url);
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize =
    Number.isInteger(rawSize) && rawSize >= 1 && rawSize <= 50 ? rawSize : PAST_PAGE_SIZE;

  // No patient profile → nothing of one's own to show.
  if (!actor.patientId) {
    return NextResponse.json<MyAppointmentsPage>({
      upcoming: [],
      past: { items: [], page, pageSize, total: 0, totalPages: 1 },
    });
  }

  const now = new Date();
  // Upcoming = active AND future; past = NOT that (done/cancelled OR past-dated).
  const upcomingWhere = {
    patientId: actor.patientId,
    status: { in: ACTIVE },
    date: { gte: now },
  };
  const pastWhere = {
    patientId: actor.patientId,
    NOT: { status: { in: ACTIVE }, date: { gte: now } },
  };

  try {
    const [upRows, pastRows, total] = await Promise.all([
      prisma.appointment.findMany({
        where: upcomingWhere,
        orderBy: { date: "asc" }, // soonest first
        select: SELECT,
      }),
      prisma.appointment.findMany({
        where: pastWhere,
        orderBy: { date: "desc" }, // newest history first
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: SELECT,
      }),
      prisma.appointment.count({ where: pastWhere }),
    ]);

    return NextResponse.json<MyAppointmentsPage>({
      upcoming: upRows.map(toApi),
      past: {
        items: pastRows.map(toApi),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (err) {
    console.error("GET /api/my/appointments failed", err);
    return apiError(500, "server", "Не вдалося завантажити записи");
  }
}
