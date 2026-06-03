import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type {
  LocalAppointment,
  LocalDoctor,
  LocalPatient,
  LocalProfile,
} from "@/lib/db";

/**
 * Role-scoped read endpoint for the Dexie mirror.
 *
 *  • PATIENT       → own profile + own appointments −60..+90 days + the
 *                    doctors those appointments reference.
 *  • STAFF / ADMIN → own profile + today..+7d appointments (clinic-wide) +
 *                    the patients those appointments reference + all doctors.
 *
 * Server (Postgres) is the only place that knows what "own" means; never
 * trust a client-side role claim. Caching is forbidden — see
 * runtimeCaching in next.config.ts (NetworkOnly for /api/mirror).
 */

export interface MirrorPayload {
  profile: LocalProfile;
  appointments: LocalAppointment[];
  patients: LocalPatient[];
  doctors: LocalDoctor[];
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nowMs = Date.now();
  const profile: LocalProfile = {
    userId: "me",
    role: session.user.role,
    patientId: session.user.patientId ?? null,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
    lastMirroredAt: nowMs,
  };

  const role = session.user.role;
  const patientId = session.user.patientId;

  let appointments: LocalAppointment[] = [];
  let patients: LocalPatient[] = [];
  let doctors: LocalDoctor[] = [];

  if (role === Role.PATIENT) {
    if (!patientId) {
      // Patient User with no linked Patient row — degrade gracefully.
      return NextResponse.json<MirrorPayload>({
        profile,
        appointments,
        patients,
        doctors,
      });
    }

    const from = new Date();
    from.setDate(from.getDate() - 60);
    const to = new Date();
    to.setDate(to.getDate() + 90);

    const rows = await prisma.appointment.findMany({
      where: { patientId, date: { gte: from, lte: to } },
      include: { patient: true, doctor: true },
      orderBy: { date: "asc" },
    });

    appointments = rows.map((a) => ({
      id: a.id,
      date: a.date.toISOString(),
      status: a.status,
      notes: a.notes,
      patientId: a.patientId,
      patientName: a.patient.name,
      doctorId: a.doctorId,
      doctorName: a.doctor.name,
      doctorSpecialty: a.doctor.specialty,
      createdAt: a.createdAt.toISOString(),
      lastMirroredAt: nowMs,
    }));

    // Only the doctors that show up in the visible window — no full roster
    // leak to a patient who never visited them.
    const ids = [...new Set(rows.map((a) => a.doctorId))];
    if (ids.length > 0) {
      const docRows = await prisma.doctor.findMany({ where: { id: { in: ids } } });
      doctors = docRows.map((d) => ({
        id: d.id,
        name: d.name,
        specialty: d.specialty,
        lastMirroredAt: nowMs,
      }));
    }
  } else {
    // STAFF / ADMIN window: midnight today → +7 full days.
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const rows = await prisma.appointment.findMany({
      where: { date: { gte: start, lte: end } },
      include: { patient: true, doctor: true },
      orderBy: { date: "asc" },
    });

    appointments = rows.map((a) => ({
      id: a.id,
      date: a.date.toISOString(),
      status: a.status,
      notes: a.notes,
      patientId: a.patientId,
      patientName: a.patient.name,
      doctorId: a.doctorId,
      doctorName: a.doctor.name,
      doctorSpecialty: a.doctor.specialty,
      createdAt: a.createdAt.toISOString(),
      lastMirroredAt: nowMs,
    }));

    // Only patients that appear in the visible window. Explicit field list —
    // no medical history, no passwordHash via User join, nothing sensitive.
    const ids = [...new Set(rows.map((a) => a.patientId))];
    if (ids.length > 0) {
      const patientRows = await prisma.patient.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, phone: true, email: true },
      });
      patients = patientRows.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        lastMirroredAt: nowMs,
      }));
    }

    // Doctor roster (clinic-public info — name + specialty only).
    const docRows = await prisma.doctor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, specialty: true },
    });
    doctors = docRows.map((d) => ({
      id: d.id,
      name: d.name,
      specialty: d.specialty,
      lastMirroredAt: nowMs,
    }));
  }

  return NextResponse.json<MirrorPayload>({
    profile,
    appointments,
    patients,
    doctors,
  });
}
