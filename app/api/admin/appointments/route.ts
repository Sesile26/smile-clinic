import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { AppointmentStatus, Role } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import {
  clinicTodayRange,
  clinicWeekRange,
  clinicDayStartFromYmd,
  clinicDayEndFromYmd,
} from "@/lib/clinic-time";
import type {
  AdminAppointment,
  AdminAppointmentsPage,
} from "@/lib/admin-appointments";

/**
 * GET /api/admin/appointments — scheduled appointments for STAFF/ADMIN/DOCTOR.
 *
 * ROLE SCOPE (server-side, never trusted from the UI):
 *  - STAFF/ADMIN: all appointments; ?doctorId narrows to one doctor.
 *  - DOCTOR: ONLY their own (where doctorId = their Doctor.id from the session);
 *    a ?doctorId param is IGNORED — a doctor can't peek at another's schedule
 *    even with a direct request.
 *  - PATIENT / guest: rejected.
 *
 * Params: period=today|week|future|range (+ from/to YYYY-MM-DD for range),
 * status=<csv> (default pending,confirmed), q (patient name/phone),
 * page/pageSize (25|50|100). "today"/"week" are computed in the CLINIC timezone
 * (see lib/clinic-time) so they're correct late in the evening.
 */

const PAGE_SIZES = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;
const VALID_STATUS = new Set<string>(Object.values(AppointmentStatus));

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  const isDoctor = actor.role === Role.DOCTOR;
  if (!isStaff(actor.role) && !isDoctor) {
    return shopError(403, "forbidden", "Немає доступу");
  }

  const { searchParams } = new URL(request.url);
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize = PAGE_SIZES.includes(rawSize) ? rawSize : DEFAULT_PAGE_SIZE;

  // A DOCTOR with no linked Doctor row has no schedule → empty (not an error).
  if (isDoctor && !actor.ownDoctorId) {
    return NextResponse.json<AdminAppointmentsPage>({
      items: [],
      total: 0,
      page,
      pageSize,
      totalPages: 1,
    });
  }

  // ── statuses (default pending+confirmed) ──────────────────────────────────
  const statusParam = searchParams.get("status");
  let statuses = statusParam
    ? statusParam.split(",").filter((s) => VALID_STATUS.has(s))
    : [];
  if (statuses.length === 0) statuses = ["pending", "confirmed"];

  // ── date window (clinic TZ for today/week) ────────────────────────────────
  const period = searchParams.get("period");
  let dateFilter: Prisma.DateTimeFilter | undefined;
  if (period === "today") {
    const { start, end } = clinicTodayRange();
    dateFilter = { gte: start, lt: end };
  } else if (period === "week") {
    const { start, end } = clinicWeekRange();
    dateFilter = { gte: start, lt: end };
  } else if (period === "range") {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const gte = from ? clinicDayStartFromYmd(from) : null;
    const lt = to ? clinicDayEndFromYmd(to) : null;
    if (gte || lt) {
      dateFilter = { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) };
    }
  } else {
    // "future" / default — everything from now on.
    dateFilter = { gte: new Date() };
  }

  // ── doctor scope ──────────────────────────────────────────────────────────
  const where: Prisma.AppointmentWhereInput = {
    status: { in: statuses as AppointmentStatus[] },
  };
  if (dateFilter) where.date = dateFilter;
  if (isDoctor) {
    where.doctorId = actor.ownDoctorId!; // forced; param ignored
  } else {
    const doctorId = searchParams.get("doctorId");
    if (doctorId) where.doctorId = doctorId;
  }

  // ── patient search ────────────────────────────────────────────────────────
  const q = (searchParams.get("q") ?? "").trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const or: Prisma.PatientWhereInput[] = [
      { name: { contains: q, mode: "insensitive" } },
    ];
    if (digits.length >= 3) or.push({ phone: { contains: digits } });
    where.patient = { OR: or };
  }

  try {
    const [rows, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        orderBy: { date: "asc" }, // soonest first
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          date: true,
          status: true,
          patient: { select: { name: true, phone: true } },
          doctor: { select: { id: true, name: true, specialty: true } },
        },
      }),
      prisma.appointment.count({ where }),
    ]);

    const items: AdminAppointment[] = rows.map((a) => ({
      id: a.id,
      date: a.date.toISOString(),
      status: a.status,
      patientName: a.patient.name,
      patientPhone: a.patient.phone,
      doctorId: a.doctor.id,
      doctorName: a.doctor.name,
      doctorSpecialty: a.doctor.specialty,
    }));

    return NextResponse.json<AdminAppointmentsPage>({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error("GET /api/admin/appointments failed", err);
    return shopError(500, "server", "Не вдалося завантажити записи");
  }
}
