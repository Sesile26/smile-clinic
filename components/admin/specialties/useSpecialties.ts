"use client";

import { useCallback, useEffect, useState } from "react";
import { ShopApiError } from "@/lib/shop-client";
import {
  createSpecialty,
  deleteSpecialty,
  getSpecialties,
  renameSpecialty,
  type ApiSpecialty,
} from "@/lib/specialties";
import { getDoctors } from "@/lib/booking-client";

export type SpecLoadState = "loading" | "ready" | "error";

export interface MutationResult {
  ok: boolean;
  error?: string;
}

export interface UseSpecialties {
  specialties: ApiSpecialty[];
  /** Doctors with no specialty (specialtyId = null) — the "Без спеціальності"
   *  summary row; grows when a non-empty specialty is deleted with reassign. */
  unassignedCount: number;
  state: SpecLoadState;
  reload: () => void;
  add: (name: string) => Promise<MutationResult>;
  rename: (id: string, name: string) => Promise<MutationResult>;
  remove: (id: string) => Promise<MutationResult>;
}

const toMsg = (err: unknown, fallback: string) =>
  err instanceof ShopApiError ? err.message : fallback;

/**
 * Specialty directory store backed by /api/specialties (same shape as
 * useShopCategories). Reads are public; mutations are STAFF/ADMIN (re-checked
 * server-side). The doctor roster is fetched alongside to derive the
 * "Без спеціальності" count; every successful mutation refetches both so counts
 * stay correct (a delete-with-reassign moves doctors to "no specialty").
 */
export function useSpecialties(): UseSpecialties {
  const [specialties, setSpecialties] = useState<ApiSpecialty[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [state, setState] = useState<SpecLoadState>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  // No synchronous setState in the effect body — updates land in the async
  // callbacks; the "loading" reset happens in reload() below.
  useEffect(() => {
    const ac = new AbortController();
    Promise.all([getSpecialties(ac.signal), getDoctors()])
      .then(([specs, doctors]) => {
        setSpecialties(specs);
        setUnassignedCount(doctors.filter((d) => !d.specialtyId).length);
        setState("ready");
      })
      .catch((err) => {
        if (ac.signal.aborted || (err as Error)?.name === "AbortError") return;
        setState("error");
      });
    return () => ac.abort();
  }, [reloadKey]);

  const reload = useCallback(() => {
    setState("loading");
    setReloadKey((k) => k + 1);
  }, []);

  // Refetch list + unassigned count after a mutation (both can change).
  const refresh = useCallback(async () => {
    const [specs, doctors] = await Promise.all([getSpecialties(), getDoctors()]);
    setSpecialties(specs);
    setUnassignedCount(doctors.filter((d) => !d.specialtyId).length);
  }, []);

  const add = useCallback(
    async (name: string): Promise<MutationResult> => {
      try {
        await createSpecialty(name);
        await refresh();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: toMsg(err, "Не вдалося додати") };
      }
    },
    [refresh],
  );

  const rename = useCallback(
    async (id: string, name: string): Promise<MutationResult> => {
      try {
        await renameSpecialty(id, name);
        await refresh();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: toMsg(err, "Не вдалося перейменувати") };
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<MutationResult> => {
      // Reassign doctors to "Без спеціальності" first when the specialty is
      // non-empty (count known from the loaded list) — server does it atomically.
      const target = specialties.find((s) => s.id === id);
      const reassign = (target?.doctorCount ?? 0) > 0;
      try {
        await deleteSpecialty(id, reassign);
        await refresh();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: toMsg(err, "Не вдалося видалити") };
      }
    },
    [specialties, refresh],
  );

  return { specialties, unassignedCount, state, reload, add, rename, remove };
}
