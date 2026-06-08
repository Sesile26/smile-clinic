"use client";

import { useCallback, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type LocalAppointment } from "@/lib/db";
import { getMyAppointments, type MyAppointment } from "@/lib/my-appointments";

export type LoadState = "loading" | "ready" | "error";

function localToMy(l: LocalAppointment): MyAppointment {
  return {
    id: l.id,
    date: l.date,
    status: l.status,
    doctorName: l.doctorName,
    doctorSpecialty: l.doctorSpecialty,
  };
}

export interface UseMyAppointmentsResult {
  items: MyAppointment[];
  state: LoadState;
  /** Online refetch after a cancel. No-op offline. */
  reload: () => void;
  source: "server" | "mirror";
}

/**
 * The patient's own appointments — from the API when online, from the Dexie
 * mirror (read-only) when offline. Mirrors the booking useSlots pattern: no
 * synchronous setState in the effect body; prior data stays visible on refetch.
 */
export function useMyAppointments(online: boolean): UseMyAppointmentsResult {
  const mirror = useLiveQuery(
    () => db.appointments.orderBy("date").toArray(),
    [],
    undefined,
  );

  const [server, setServer] = useState<{ items: MyAppointment[]; state: LoadState }>({
    items: [],
    state: "loading",
  });
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!online) return;
    const ac = new AbortController();
    getMyAppointments(ac.signal)
      .then((items) => setServer({ items, state: "ready" }))
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setServer({ items: [], state: "error" });
      });
    return () => ac.abort();
  }, [online, reloadKey]);

  if (online) return { ...server, reload, source: "server" };

  const items = (mirror ?? []).map(localToMy);
  return {
    items,
    state: mirror === undefined ? "loading" : "ready",
    reload,
    source: "mirror",
  };
}
