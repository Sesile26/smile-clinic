import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { AppointmentStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import type { AdminPatientAppointment } from "@/lib/admin-patients";

/**
 * GET /api/admin/patients/[id]/appointments — one patient's history, for
 * STAFF/ADMIN/DOCTOR. Role scope enforced HERE:
 *  - STAFF/ADMIN: the patient's full history.
 *  - DOCTOR: ONLY appointments with this doctor. If the patient has none with
 *    them (i.e. "not their patient"), responds 404 — nothing leaks. The
 *    ownership check is independent of the status/date filters, so an empty
 *    filtered result for a legitimate patient is a normal 200 [].
 *  - PATIENT / guest: rejected.
 *
 * Optional server-side filters: ?status, ?from=YYYY-MM-DD, ?to=YYYY-MM-DD.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUS = new Set<string>(Object.values(AppointmentStatus));

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

  const where: Prisma.AppointmentWhereInput = { patientId: id };
  if (isDoctor) {
    // A doctor with no linked row owns no patients.
    if (!actor.ownDoctorId) {
      return shopError(404, "not_found", "Пацієнта не знайдено");
    }
    where.doctorId = actor.ownDoctorId;
    // Ownership check — independent of status/date filters: if this doctor has
    // no appointment with the patient, it isn't their patient → 404.
    const owns = await prisma.appointment.count({
      where: { patientId: id, doctorId: actor.ownDoctorId },
    });
    if (owns === 0) {
      return shopError(404, "not_found", "Пацієнта не знайдено");
    }
  }

  // Optional filters (the UI filters client-side over the small per-patient
  // set, but the endpoint supports server filters too).
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  if (status && VALID_STATUS.has(status)) {
    where.status = status as AppointmentStatus;
  }
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if ((from && DATE_RE.test(from)) || (to && DATE_RE.test(to))) {
    where.date = {
      ...(from && DATE_RE.test(from)
        ? { gte: new Date(`${from}T00:00:00.000Z`) }
        : {}),
      ...(to && DATE_RE.test(to)
        ? { lte: new Date(`${to}T23:59:59.999Z`) }
        : {}),
    };
  }

  try {
    const rows = await prisma.appointment.findMany({
      where,
      orderBy: { date: "desc" },
      select: {
        id: true,
        date: true,
        status: true,
        notes: true,
        doctor: { select: { name: true, specialty: { select: { name: true } } } },
      },
    });
    const items: AdminPatientAppointment[] = rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      status: r.status,
      notes: r.notes,
      doctorName: r.doctor.name,
      doctorSpecialty: r.doctor.specialty?.name ?? null,
    }));
    return NextResponse.json<AdminPatientAppointment[]>(items);
  } catch (err) {
    console.error("GET /api/admin/patients/[id]/appointments failed", err);
    return shopError(500, "server", "Не вдалося завантажити історію");
  }
}
