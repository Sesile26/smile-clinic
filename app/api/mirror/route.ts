import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { Role, SlotStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type {
  LocalAppointment,
  LocalDoctor,
  LocalPatient,
  LocalProfile,
  LocalSlot,
} from "@/lib/db";

/**
 * Role-scoped read endpoint for the Dexie mirror (offline VIEWING only).
 *
 *  • PATIENT       → own profile + own appointments −60..+90 days + the doctors
 *                    those appointments reference. No slots (patients don't
 *                    edit schedules; they book online).
 *  • DOCTOR        → own profile (+doctorId) + OWN slots & appointments for the
 *                    working window (today..+14d) + self in the doctor roster +
 *                    the patients those appointments reference.
 *  • STAFF / ADMIN → own profile + clinic-wide appointments & ALL slots for
 *                    today..+7d + referenced patients + full doctor roster.
 *
 * Server (Postgres) is the only place that knows what "own" means; never trust
 * a client-side role/doctorId claim. NetworkOnly in the SW — Dexie is the
 * offline read path, not the SW cache.
 */

export interface MirrorPayload {
  profile: LocalProfile;
  appointments: LocalAppointment[];
  patients: LocalPatient[];
  doctors: LocalDoctor[];
  slots: LocalSlot[];
}

const DOCTOR_WINDOW_DAYS = 14;
const STAFF_WINDOW_DAYS = 7;

type ApptRow = {
  id: string;
  date: Date;
  status: LocalAppointment["status"];
  notes: string | null;
  patientId: string;
  patient: { name: string };
  doctorId: string;
  doctor: { name: string; specialty: { name: string } | null };
  createdAt: Date;
};

type SlotRow = {
  id: string;
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  status: SlotStatus;
  doctor: { name: string; specialty: { name: string } | null };
};

// Doctor select that pulls the specialty NAME via the relation (display only).
const DOCTOR_NAME_SPEC = {
  select: { name: true, specialty: { select: { name: true } } },
} as const;
// Doctor select for the roster: id + name + specialty id/name (filter + display).
const DOCTOR_ROSTER_SELECT = {
  id: true,
  name: true,
  specialty: { select: { id: true, name: true } },
} as const;

type DoctorRosterRow = {
  id: string;
  name: string;
  specialty: { id: string; name: string } | null;
};
function mapDoctor(d: DoctorRosterRow, nowMs: number): LocalDoctor {
  return {
    id: d.id,
    name: d.name,
    specialtyId: d.specialty?.id ?? null,
    specialtyName: d.specialty?.name ?? null,
    lastMirroredAt: nowMs,
  };
}

function mapAppt(a: ApptRow, nowMs: number): LocalAppointment {
  return {
    id: a.id,
    date: a.date.toISOString(),
    status: a.status,
    notes: a.notes,
    patientId: a.patientId,
    patientName: a.patient.name,
    doctorId: a.doctorId,
    doctorName: a.doctor.name,
    doctorSpecialty: a.doctor.specialty?.name ?? null,
    createdAt: a.createdAt.toISOString(),
    lastMirroredAt: nowMs,
  };
}

function mapSlot(s: SlotRow, nowMs: number): LocalSlot {
  return {
    id: s.id,
    doctorId: s.doctorId,
    doctorName: s.doctor.name,
    doctorSpecialty: s.doctor.specialty?.name ?? null,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    // Mirror free|booked only (patients mirror no slots at all).
    status: s.status === "booked" ? "booked" : "free",
    lastMirroredAt: nowMs,
  };
}

function midnightPlusDays(days: number): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return { start, end };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nowMs = Date.now();
  const role = session.user.role;
  const patientId = session.user.patientId;

  // Authoritative doctor link (don't trust the JWT claim for data scope).
  const ownDoctor =
    role === Role.DOCTOR
      ? await prisma.doctor.findUnique({
          where: { userId: session.user.id },
          select: DOCTOR_ROSTER_SELECT,
        })
      : null;

  const profile: LocalProfile = {
    userId: "me",
    role,
    patientId: patientId ?? null,
    doctorId: ownDoctor?.id ?? null,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
    lastMirroredAt: nowMs,
  };

  let appointments: LocalAppointment[] = [];
  let patients: LocalPatient[] = [];
  let doctors: LocalDoctor[] = [];
  let slots: LocalSlot[] = [];

  // ─── PATIENT ───────────────────────────────────────────────────────────────
  if (role === Role.PATIENT) {
    if (!patientId) {
      return NextResponse.json<MirrorPayload>({
        profile,
        appointments,
        patients,
        doctors,
        slots,
      });
    }

    const from = new Date();
    from.setDate(from.getDate() - 60);
    const to = new Date();
    to.setDate(to.getDate() + 90);

    const rows = await prisma.appointment.findMany({
      where: { patientId, date: { gte: from, lte: to } },
      include: { patient: { select: { name: true } }, doctor: DOCTOR_NAME_SPEC },
      orderBy: { date: "asc" },
    });
    appointments = rows.map((a) => mapAppt(a, nowMs));

    const ids = [...new Set(rows.map((a) => a.doctorId))];
    if (ids.length > 0) {
      const docRows = await prisma.doctor.findMany({
        where: { id: { in: ids } },
        select: DOCTOR_ROSTER_SELECT,
      });
      doctors = docRows.map((d) => mapDoctor(d, nowMs));
    }

    return NextResponse.json<MirrorPayload>({
      profile,
      appointments,
      patients,
      doctors,
      slots,
    });
  }

  // ─── DOCTOR ──────────────────────────────────────────────────────────────────
  if (role === Role.DOCTOR) {
    if (!ownDoctor) {
      // Role assigned but not yet linked to a Doctor row — nothing to mirror.
      return NextResponse.json<MirrorPayload>({
        profile,
        appointments,
        patients,
        doctors,
        slots,
      });
    }

    const { start, end } = midnightPlusDays(DOCTOR_WINDOW_DAYS);

    const [slotRows, apptRows] = await Promise.all([
      prisma.availabilitySlot.findMany({
        where: { doctorId: ownDoctor.id, startsAt: { gte: start, lt: end } },
        include: { doctor: DOCTOR_NAME_SPEC },
        orderBy: { startsAt: "asc" },
      }),
      prisma.appointment.findMany({
        where: { doctorId: ownDoctor.id, date: { gte: start, lt: end } },
        include: { patient: { select: { name: true } }, doctor: DOCTOR_NAME_SPEC },
        orderBy: { date: "asc" },
      }),
    ]);

    slots = slotRows.map((s) => mapSlot(s, nowMs));
    appointments = apptRows.map((a) => mapAppt(a, nowMs));
    doctors = [mapDoctor(ownDoctor, nowMs)];

    const pIds = [...new Set(apptRows.map((a) => a.patientId))];
    if (pIds.length > 0) {
      const patientRows = await prisma.patient.findMany({
        where: { id: { in: pIds } },
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

    return NextResponse.json<MirrorPayload>({
      profile,
      appointments,
      patients,
      doctors,
      slots,
    });
  }

  // ─── STAFF / ADMIN ───────────────────────────────────────────────────────────
  const { start, end } = midnightPlusDays(STAFF_WINDOW_DAYS);

  const [apptRows, slotRows, docRows] = await Promise.all([
    prisma.appointment.findMany({
      where: { date: { gte: start, lte: end } },
      include: { patient: { select: { name: true } }, doctor: DOCTOR_NAME_SPEC },
      orderBy: { date: "asc" },
    }),
    prisma.availabilitySlot.findMany({
      where: { startsAt: { gte: start, lt: end } },
      include: { doctor: DOCTOR_NAME_SPEC },
      orderBy: { startsAt: "asc" },
    }),
    prisma.doctor.findMany({
      orderBy: { name: "asc" },
      select: DOCTOR_ROSTER_SELECT,
    }),
  ]);

  appointments = apptRows.map((a) => mapAppt(a, nowMs));
  slots = slotRows.map((s) => mapSlot(s, nowMs));
  doctors = docRows.map((d) => mapDoctor(d, nowMs));

  const pIds = [...new Set(apptRows.map((a) => a.patientId))];
  if (pIds.length > 0) {
    const patientRows = await prisma.patient.findMany({
      where: { id: { in: pIds } },
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

  return NextResponse.json<MirrorPayload>({
    profile,
    appointments,
    patients,
    doctors,
    slots,
  });
}
