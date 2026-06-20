"use client";

import { useCallback, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type LocalAppointment } from "@/lib/db";
import {
  getMyAppointments,
  type MyAppointment,
  type MyAppointmentsPage,
} from "@/lib/my-appointments";
import { isUpcoming } from "@/components/my/appointments/data";

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
  upcoming: MyAppointment[];
  past: MyAppointmentsPage["past"];
  /** First-load / error state for the whole view. */
  state: LoadState;
  /** True while a NEW history page is loading (after the first load). */
  pastLoading: boolean;
  /** Online refetch after a cancel. No-op offline. */
  reload: () => void;
  source: "server" | "mirror";
}

const emptyPast = (page: number, pageSize: number): MyAppointmentsPage["past"] => ({
  items: [],
  page,
  pageSize,
  total: 0,
  totalPages: 1,
});

/**
 * The patient's own appointments — ALL upcoming + one history page. Online →
 * GET /api/my/appointments (offset-paginated past); offline → the Dexie mirror
 * (read-only), split + paginated client-side. Loading is DERIVED (loadedKey vs
 * requestKey) so the fetch effect never calls setState in its body; prior data
 * stays visible while the next history page loads.
 */
export function useMyAppointments(
  online: boolean,
  page: number,
  pageSize: number,
): UseMyAppointmentsResult {
  const mirror = useLiveQuery(
    () => db.appointments.orderBy("date").toArray(),
    [],
    undefined,
  );

  const [data, setData] = useState<MyAppointmentsPage | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => {
    setErrorKey(null);
    setReloadKey((k) => k + 1);
  }, []);

  const requestKey = `${page}|${pageSize}|${reloadKey}`;

  useEffect(() => {
    if (!online || loadedKey === requestKey) return;
    const ac = new AbortController();
    getMyAppointments(page, pageSize, ac.signal)
      .then((d) => {
        setData(d);
        setLoadedKey(requestKey);
      })
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setErrorKey(requestKey);
      });
    return () => ac.abort();
  }, [online, requestKey, page, pageSize, loadedKey]);

  if (online) {
    const isError = errorKey === requestKey;
    const isLoading = !isError && data === null;
    return {
      upcoming: data?.upcoming ?? [],
      past: data?.past ?? emptyPast(page, pageSize),
      state: isError ? "error" : isLoading ? "loading" : "ready",
      pastLoading: data !== null && loadedKey !== requestKey,
      reload,
      source: "server",
    };
  }

  // ── Offline: split + paginate the mirror with the same rule as the server ──
  const all = (mirror ?? []).map(localToMy);
  const now = new Date();
  const upcoming = all
    .filter((a) => isUpcoming(a, now))
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const pastAll = all
    .filter((a) => !isUpcoming(a, now))
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const total = pastAll.length;
  const start = (page - 1) * pageSize;
  return {
    upcoming,
    past: {
      items: pastAll.slice(start, start + pageSize),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
    state: mirror === undefined ? "loading" : "ready",
    pastLoading: false,
    reload,
    source: "mirror",
  };
}
