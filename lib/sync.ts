import { db, type LocalAppointment, type LocalPatient } from "./db";

export interface SyncResult {
  synced: number;
  failed: number;
}

export interface SyncAllResult {
  appointments: SyncResult;
  patients: SyncResult;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${url} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function extractServerId(payload: unknown): string | undefined {
  if (payload && typeof payload === "object" && "id" in payload) {
    const id = (payload as { id: unknown }).id;
    if (typeof id === "string") return id;
    if (typeof id === "number") return String(id);
  }
  return undefined;
}

export async function syncAppointments(): Promise<SyncResult> {
  let synced = 0;
  let failed = 0;

  let pending: LocalAppointment[] = [];
  try {
    pending = await db.appointments.where("status").equals("pending").toArray();
  } catch (err) {
    console.error("[sync] failed to read pending appointments", err);
    return { synced, failed };
  }

  for (const appt of pending) {
    try {
      const created = await postJSON<unknown>("/api/appointments", appt);
      await db.appointments.update(appt.id, {
        status: "synced",
        serverId: extractServerId(created),
      });
      synced += 1;
    } catch (err) {
      console.error(`[sync] appointment ${appt.id} failed`, err);
      try {
        await db.appointments.update(appt.id, { status: "failed" });
      } catch (updateErr) {
        console.error(
          `[sync] could not mark appointment ${appt.id} as failed`,
          updateErr,
        );
      }
      failed += 1;
    }
  }

  return { synced, failed };
}

export async function syncPatients(): Promise<SyncResult> {
  let synced = 0;
  let failed = 0;

  let unsynced: LocalPatient[] = [];
  try {
    unsynced = await db.patients.filter((p) => !p.synced).toArray();
  } catch (err) {
    console.error("[sync] failed to read unsynced patients", err);
    return { synced, failed };
  }

  for (const patient of unsynced) {
    try {
      await postJSON<unknown>("/api/patients", patient);
      await db.patients.update(patient.id, { synced: true });
      synced += 1;
    } catch (err) {
      console.error(`[sync] patient ${patient.id} failed`, err);
      failed += 1;
    }
  }

  return { synced, failed };
}

export async function syncAll(): Promise<SyncAllResult> {
  const [appointments, patients] = await Promise.all([
    syncAppointments().catch((err) => {
      console.error("[sync] syncAppointments threw", err);
      return { synced: 0, failed: 0 } satisfies SyncResult;
    }),
    syncPatients().catch((err) => {
      console.error("[sync] syncPatients threw", err);
      return { synced: 0, failed: 0 } satisfies SyncResult;
    }),
  ]);
  return { appointments, patients };
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void syncAll().catch((err) => {
      console.error("[sync] online auto-sync failed", err);
    });
  });
}
