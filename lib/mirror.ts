import {
  db,
  type LocalAppointment,
  type LocalDoctor,
  type LocalPatient,
  type LocalProfile,
} from "./db";

export type MirrorReason = "offline" | "unauthorized" | "server";

export interface MirrorResult {
  ok: boolean;
  reason?: MirrorReason;
}

interface MirrorPayload {
  profile: LocalProfile;
  appointments: LocalAppointment[];
  patients: LocalPatient[];
  doctors: LocalDoctor[];
}

/**
 * Pulls a role-scoped data slice from /api/mirror and atomically replaces
 * the local mirror. Strictly one-way: server → Dexie. No upstream sync.
 *
 *   - 401 ⇒ session is gone; wipe Dexie defensively.
 *   - fetch throws (offline) ⇒ leave existing data untouched, return
 *     `{ ok: false, reason: "offline" }` so the UI can show a banner.
 *   - 5xx ⇒ same: don't trash valid local data on a transient server hiccup.
 *
 * Atomicity: the clear+bulkPut runs inside a single Dexie transaction.
 * Any throw during the transaction rolls it back, so the user never sees
 * a partial mirror.
 */
export async function pullMirror(): Promise<MirrorResult> {
  let payload: MirrorPayload;

  try {
    const res = await fetch("/api/mirror", { cache: "no-store" });

    if (res.status === 401) {
      await wipeAllTables();
      return { ok: false, reason: "unauthorized" };
    }
    if (!res.ok) {
      return { ok: false, reason: "server" };
    }
    payload = (await res.json()) as MirrorPayload;
  } catch (err) {
    // Network failure (offline or DNS hiccup). Keep prior mirror intact.
    console.warn("[mirror] pull failed (offline?)", err);
    return { ok: false, reason: "offline" };
  }

  await db.transaction(
    "rw",
    [db.appointments, db.patients, db.doctors, db.profile],
    async () => {
      await Promise.all([
        db.appointments.clear(),
        db.patients.clear(),
        db.doctors.clear(),
        db.profile.clear(),
      ]);
      await Promise.all([
        db.appointments.bulkPut(payload.appointments),
        db.patients.bulkPut(payload.patients),
        db.doctors.bulkPut(payload.doctors),
        db.profile.put(payload.profile),
      ]);
    },
  );

  return { ok: true };
}

async function wipeAllTables(): Promise<void> {
  await db.transaction(
    "rw",
    [db.appointments, db.patients, db.doctors, db.profile],
    async () => {
      await Promise.all([
        db.appointments.clear(),
        db.patients.clear(),
        db.doctors.clear(),
        db.profile.clear(),
      ]);
    },
  );
}
