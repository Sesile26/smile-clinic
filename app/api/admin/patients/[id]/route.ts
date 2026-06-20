import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import type { AdminPatientRow } from "@/lib/admin-patients";

/**
 * GET /api/admin/patients/[id] — one patient's basic card, for deep-linking
 * into the profile (e.g. ?patient=<id> from the booked-slot popup).
 *
 * SECURITY: the SAME role/ownership gate as the patients list, so ?patient=<id>
 * can't bypass access:
 *  - STAFF/ADMIN: any patient; counts span all appointments.
 *  - DOCTOR: only a patient who has ≥1 appointment with THEM; otherwise 404
 *    (no existence leak). Counts/last-visit are scoped to this doctor.
 *  - PATIENT / guest: rejected.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  const isDoctor = actor.role === "DOCTOR";
  if (!isStaff(actor.role) && !isDoctor) {
    return shopError(403, "forbidden", "Немає доступу");
  }

  const { id } = await params;

  // A doctor with no linked row owns no patients.
  if (isDoctor && !actor.ownDoctorId) {
    return shopError(404, "not_found", "Пацієнта не знайдено");
  }

  try {
    const patient = await prisma.patient.findUnique({
      where: { id },
      select: { id: true, name: true, phone: true, email: true },
    });
    if (!patient) return shopError(404, "not_found", "Пацієнта не знайдено");

    // Count + last visit within the caller's scope (doctor → only their own).
    const where = isDoctor
      ? { patientId: id, doctorId: actor.ownDoctorId! }
      : { patientId: id };
    const agg = await prisma.appointment.aggregate({
      where,
      _count: { _all: true },
      _max: { date: true },
    });

    // Ownership: a doctor with no appointment with this patient → not theirs.
    if (isDoctor && agg._count._all === 0) {
      return shopError(404, "not_found", "Пацієнта не знайдено");
    }

    return NextResponse.json<AdminPatientRow>({
      id: patient.id,
      name: patient.name,
      phone: patient.phone,
      email: patient.email,
      appointmentCount: agg._count._all,
      lastVisitAt: agg._max.date ? agg._max.date.toISOString() : null,
    });
  } catch (err) {
    console.error("GET /api/admin/patients/[id] failed", err);
    return shopError(500, "server", "Не вдалося завантажити пацієнта");
  }
}
