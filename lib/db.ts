import Dexie, { type Table } from "dexie";

/**
 * Read-only mirror of the server's clinical data, scoped to the currently
 * signed-in user. Wiped on signOut (see Header.handleSignOut) so a shared
 * device never leaks one user's records to the next.
 *
 * Server (Postgres) is the source of truth. lib/mirror.ts pulls a role-aware
 * slice into here over the network; useLiveQuery reads it back offline.
 * There is NO reverse sync — registration and appointment booking remain
 * online-only.
 */

export type AppointmentStatus = "pending" | "confirmed" | "done" | "cancelled";

export interface LocalAppointment {
  /** Server cuid. */
  id: string;
  /** ISO date-time (combined). Use new Date(date) for display. */
  date: string;
  status: AppointmentStatus;
  notes: string | null;
  patientId: string;
  /** Denormalised for fast list rendering — refreshed on every mirror pull. */
  patientName: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialty: string;
  createdAt: string;
  /** Date.now() of the most recent pull that included this row. */
  lastMirroredAt: number;
}

export interface LocalPatient {
  id: string;
  name: string;
  email: string | null;
  /** Null for Google-only patients — that flow never collects a phone. */
  phone: string | null;
  lastMirroredAt: number;
}

export interface LocalDoctor {
  id: string;
  name: string;
  specialty: string;
  lastMirroredAt: number;
}

export interface LocalProfile {
  /** Always the literal "me" — singleton row for the current session. */
  userId: string;
  role: "PATIENT" | "STAFF" | "ADMIN";
  patientId: string | null;
  name: string | null;
  email: string | null;
  image: string | null;
  lastMirroredAt: number;
}

export class ClinicDatabase extends Dexie {
  appointments!: Table<LocalAppointment, string>;
  patients!: Table<LocalPatient, string>;
  doctors!: Table<LocalDoctor, string>;
  profile!: Table<LocalProfile, string>;

  constructor() {
    super("ClinicDatabase");

    // v1 was the legacy offline-write design (status: pending/synced/failed
    // + sync queue). It never shipped; the migration just drops its rows.
    this.version(1).stores({
      appointments: "id, status, date, serverId",
      patients: "id",
    });

    // v2: read-only mirror. Indexes chosen for the dashboard "next visits"
    // query (by date) and per-doctor / per-patient lookups.
    this.version(2)
      .stores({
        appointments: "id, date, status, doctorId, patientId",
        patients: "id, name",
        doctors: "id",
        profile: "userId",
      })
      .upgrade((tx) =>
        Promise.all([
          tx.table("appointments").clear(),
          tx.table("patients").clear(),
        ]).then(() => undefined),
      );
  }
}

export const db = new ClinicDatabase();

/**
 * Drops the entire IndexedDB. Called on signOut so the next user on a
 * shared device starts with an empty mirror. Idempotent: succeeds even if
 * the database has not been opened yet.
 */
export async function wipeDexie(): Promise<void> {
  try {
    await db.delete();
  } catch (err) {
    // Worst case: still-open connections in another tab. Swallow — we'd
    // rather let signOut proceed than block on a stale lock.
    console.warn("[wipeDexie] failed to drop database", err);
  }
}
