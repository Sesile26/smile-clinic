"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type LocalSlot } from "@/lib/db";
import { getDoctors, getSlots } from "@/lib/booking-client";
import type { ApiDoctor, ApiSlot } from "@/lib/booking-types";

export type AppRole = "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";
export type LoadState = "loading" | "ready" | "error";

export interface BookingIdentity {
  /** False while we still don't know who the user is (skeleton). */
  ready: boolean;
  role: AppRole | null;
  doctorId: string | null;
  patientId: string | null;
  name: string | null;
  email: string | null;
}

/**
 * Who is the current user, online or offline?
 *
 * Prefers the live Auth.js session (freshest, carries role/doctorId/patientId).
 * Falls back to the mirrored Dexie profile when the session can't load — e.g.
 * offline, where /api/auth/session is NetworkOnly. The page guard in proxy.ts
 * already blocks anonymous access, so a null role here means "still resolving".
 */
export function useBookingIdentity(): BookingIdentity {
  const { data: session, status } = useSession();
  const profile = useLiveQuery(() => db.profile.get("me"), [], undefined);

  if (status === "authenticated" && session?.user) {
    return {
      ready: true,
      role: session.user.role as AppRole,
      doctorId: session.user.doctorId ?? null,
      patientId: session.user.patientId ?? null,
      name: session.user.name ?? null,
      email: session.user.email ?? null,
    };
  }
  if (profile) {
    return {
      ready: true,
      role: profile.role,
      doctorId: profile.doctorId,
      patientId: profile.patientId,
      name: profile.name,
      email: profile.email,
    };
  }
  return {
    ready: status === "unauthenticated",
    role: null,
    doctorId: null,
    patientId: null,
    name: null,
    email: null,
  };
}

export function isManager(role: AppRole | null): boolean {
  return role === "DOCTOR" || role === "STAFF" || role === "ADMIN";
}

// ─── Doctors roster (online: API, offline: Dexie mirror) ─────────────────────

export function useDoctors(online: boolean): {
  doctors: ApiDoctor[];
  state: LoadState;
} {
  const mirror = useLiveQuery(
    async () => {
      // `doctors` is indexed by id only — sort by name in JS.
      const rows = await db.doctors.toArray();
      return rows.sort((a, b) => a.name.localeCompare(b.name, "uk"));
    },
    [],
    undefined,
  );
  const [server, setServer] = useState<{ doctors: ApiDoctor[]; state: LoadState }>(
    { doctors: [], state: "loading" },
  );

  useEffect(() => {
    if (!online) return;
    // No synchronous setState here (keeps prior data visible, avoids the
    // set-state-in-effect cascade); state updates land in the async callbacks.
    let cancelled = false;
    getDoctors()
      .then((doctors) => {
        if (!cancelled) setServer({ doctors, state: "ready" });
      })
      .catch(() => {
        if (!cancelled) setServer({ doctors: [], state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [online]);

  if (online) return server;

  const doctors = (mirror ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    specialtyId: d.specialtyId,
    specialtyName: d.specialtyName,
  }));
  return { doctors, state: mirror === undefined ? "loading" : "ready" };
}

// ─── Slots for a range (online: API, offline: Dexie mirror) ──────────────────

function localToApiSlot(s: LocalSlot): ApiSlot {
  return {
    id: s.id,
    doctorId: s.doctorId,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    status: s.status,
  };
}

export interface UseSlotsResult {
  slots: ApiSlot[];
  state: LoadState;
  /** Forces an online refetch (after create/delete/booking). No-op offline. */
  reload: () => void;
  /** Where the data came from — drives the read-only / offline UX. */
  source: "server" | "mirror";
}

export function useSlots(params: {
  doctorId: string | null;
  fromISO: string;
  toISO: string;
  online: boolean;
  /** Skip fetching (e.g. while the doctor list is still loading). */
  enabled?: boolean;
}): UseSlotsResult {
  const { doctorId, fromISO, toISO, online, enabled = true } = params;
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Offline source: the mirrored slice for this doctor, filtered to the range.
  // UTC ISO compares lexicographically === chronologically.
  const mirror = useLiveQuery(
    async () => {
      if (!doctorId) return [] as LocalSlot[];
      return db.slots.where("doctorId").equals(doctorId).toArray();
    },
    [doctorId],
    undefined,
  );

  const [server, setServer] = useState<{ slots: ApiSlot[]; state: LoadState }>({
    slots: [],
    state: "loading",
  });

  useEffect(() => {
    if (!online || !enabled || !doctorId) return;
    // No synchronous setState (see useDoctors) — prior slots stay visible until
    // the new fetch resolves, which also avoids a loading flicker on refetch.
    const ac = new AbortController();
    getSlots(doctorId, fromISO, toISO, ac.signal)
      .then((slots) => setServer({ slots, state: "ready" }))
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setServer({ slots: [], state: "error" });
      });
    return () => ac.abort();
  }, [online, enabled, doctorId, fromISO, toISO, reloadKey]);

  if (online) {
    return { ...server, reload, source: "server" };
  }

  const slots = (mirror ?? [])
    .filter((s) => s.startsAt >= fromISO && s.startsAt < toISO)
    .map(localToApiSlot);
  return {
    slots,
    state: mirror === undefined ? "loading" : "ready",
    reload,
    source: "mirror",
  };
}
