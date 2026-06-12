import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import type { AdminPatientRow, AdminPatientsPage } from "@/lib/admin-patients";

/**
 * GET /api/admin/patients — patient list with appointment history, for
 * STAFF/ADMIN/DOCTOR. Role scope is enforced HERE (never trusted from the UI):
 *  - STAFF/ADMIN: every patient who has ≥1 appointment.
 *  - DOCTOR: ONLY patients who have ≥1 appointment WITH THIS DOCTOR, and the
 *    count / last-visit are scoped to that doctor's appointments (the doctor
 *    filter lives in the JOIN ON, so other doctors' rows never contribute).
 *  - PATIENT / guest: rejected.
 *
 * Offset pagination (page / pageSize 25|50|100), name/phone search, sorted by
 * most recent appointment (last visit) desc. Sorting by MAX(date) per patient
 * needs a GROUP BY, so this is a raw query (Prisma can't orderBy a relation
 * aggregate). Existing single-column indexes (patientId, doctorId, date) back it.
 */

const PAGE_SIZES = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  const isDoctor = actor.role === "DOCTOR";
  if (!isStaff(actor.role) && !isDoctor) {
    return shopError(403, "forbidden", "Немає доступу");
  }

  const { searchParams } = new URL(request.url);
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize = PAGE_SIZES.includes(rawSize) ? rawSize : DEFAULT_PAGE_SIZE;
  const q = (searchParams.get("q") ?? "").trim();
  const offset = (page - 1) * pageSize;

  // A DOCTOR with no linked Doctor row owns no patients → empty (not an error).
  if (isDoctor && !actor.ownDoctorId) {
    return NextResponse.json<AdminPatientsPage>({
      items: [],
      total: 0,
      page,
      pageSize,
      totalPages: 1,
    });
  }

  // Doctor scope goes in the JOIN ON so COUNT/MAX only see this doctor's rows
  // AND only patients with ≥1 such appointment survive the inner join.
  const doctorFilter = isDoctor
    ? Prisma.sql`AND a."doctorId" = ${actor.ownDoctorId}`
    : Prisma.empty;

  let searchFilter = Prisma.empty;
  if (q) {
    const namePat = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    searchFilter =
      digits.length >= 3
        ? Prisma.sql`AND (p.name ILIKE ${namePat} OR p.phone ILIKE ${`%${digits}%`})`
        : Prisma.sql`AND p.name ILIKE ${namePat}`;
  }

  try {
    const [rows, totalRows] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          appt_count: number;
          last_visit: Date | null;
        }>
      >(Prisma.sql`
        SELECT p.id, p.name, p.phone, p.email,
               COUNT(a.id)::int AS appt_count,
               MAX(a.date) AS last_visit
        FROM "Patient" p
        JOIN "Appointment" a ON a."patientId" = p.id ${doctorFilter}
        WHERE TRUE ${searchFilter}
        GROUP BY p.id
        ORDER BY MAX(a.date) DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS count FROM (
          SELECT p.id
          FROM "Patient" p
          JOIN "Appointment" a ON a."patientId" = p.id ${doctorFilter}
          WHERE TRUE ${searchFilter}
          GROUP BY p.id
        ) sub
      `),
    ]);

    const total = totalRows[0]?.count ?? 0;
    const items: AdminPatientRow[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      appointmentCount: r.appt_count,
      lastVisitAt: r.last_visit ? new Date(r.last_visit).toISOString() : null,
    }));

    return NextResponse.json<AdminPatientsPage>({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error("GET /api/admin/patients failed", err);
    return shopError(500, "server", "Не вдалося завантажити пацієнтів");
  }
}
