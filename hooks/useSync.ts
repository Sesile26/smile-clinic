"use client";

import { useCallback, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { syncAll, type SyncAllResult } from "@/lib/sync";

export function useSync() {
  const [isSyncing, setIsSyncing] = useState(false);

  const pendingAppointments = useLiveQuery(
    () => db.appointments.where("status").equals("pending").count(),
    [],
    0,
  );

  const pendingPatients = useLiveQuery(
    () => db.patients.filter((p) => !p.synced).count(),
    [],
    0,
  );

  const pendingCount = pendingAppointments + pendingPatients;

  const triggerSync = useCallback(async (): Promise<SyncAllResult | null> => {
    if (typeof window === "undefined") return null;

    setIsSyncing(true);
    try {
      return await syncAll();
    } catch (err) {
      console.error("[useSync] triggerSync failed", err);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return { isSyncing, pendingCount, triggerSync };
}
