import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import {
  PATIENT_HISTORY_PAGE_SIZE,
  type AdminPatientAppointment,
  type AdminPatientHistory,
} from "@/lib/admin-patients";

/**
 * GET /api/admin/patients/[id]/appointments?page&pageSize — one patient's
 * history for STAFF/ADMIN/DOCTOR. ALL upcoming (date >= now) plus ONE offset
 * page of past (date < now, newest first). Mirrors /my/appointments.
 *
 * Role scope enforced HERE — pagination does NOT loosen it:
 *  - STAFF/ADMIN: the patient's full history.
 *  - DOCTOR: scoped to THEIR appointments (where doctorId = own) AND only if the
 *    patient has ≥1 appointment with them — otherwise 404 (no leak), regardless
 *    of ?page. A doctor never sees another doctor's records of the patient.
 *  - PATIENT / guest: rejected.
 *
 * Upcoming/past split is by `date` vs the server's now (UTC, consistent with
 * the stored UTC datetimes).
 */

const SELECT = {
  id: true,
  date: true,
  status: true,
  notes: true,
  doctor: { select: { name: true, specialty: { select: { name: true } } } },
} as const;

type Row = {
  id: string;
  date: Date;
  status: AdminPatientAppointment["status"];
  notes: string | null;
  doctor: { name: string; specialty: { name: string } | null };
};

const toApi = (r: Row): AdminPatientAppointment => ({
  id: r.id,
  date: r.date.toISOString(),
  status: r.status,
  notes: r.notes,
  doctorName: r.doctor.name,
  doctorSpecialty: r.doctor.specialty?.name ?? null,
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  const isDoctor = actor.role === "DOCTOR";
  if (!isStaff(actor.role) && !isDoctor) {
    return shopError(403, "forbidden", "Немає доступу");
  }

  const { id } = await params;

  // Base scope: a DOCTOR is restricted to their own appointments with the
  // patient, and only if they have any (else "not their patient" → 404).
  const base: Prisma.AppointmentWhereInput = { patientId: id };
  if (isDoctor) {
    if (!actor.ownDoctorId) {
      return shopError(404, "not_found", "Пацієнта не знайдено");
    }
    base.doctorId = actor.ownDoctorId;
    const owns = await prisma.appointment.count({
      where: { patientId: id, doctorId: actor.ownDoctorId },
    });
    if (owns === 0) {
      return shopError(404, "not_found", "Пацієнта не знайдено");
    }
  }

  const { searchParams } = new URL(request.url);
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize =
    Number.isInteger(rawSize) && rawSize >= 1 && rawSize <= 50
      ? rawSize
      : PATIENT_HISTORY_PAGE_SIZE;

  const now = new Date();
  const upcomingWhere = { ...base, date: { gte: now } };
  const pastWhere = { ...base, date: { lt: now } };

  try {
    const [upcoming, pastRows, pastTotal] = await Promise.all([
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

    return NextResponse.json<AdminPatientHistory>({
      upcoming: upcoming.map(toApi),
      past: {
        items: pastRows.map(toApi),
        page,
        pageSize,
        total: pastTotal,
        totalPages: Math.max(1, Math.ceil(pastTotal / pageSize)),
      },
    });
  } catch (err) {
    console.error("GET /api/admin/patients/[id]/appointments failed", err);
    return shopError(500, "server", "Не вдалося завантажити історію");
  }
}
