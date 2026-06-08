"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type LocalProduct } from "@/lib/db";
import { getProducts } from "@/lib/shop-client";
import type { ApiProduct } from "@/lib/shop-types";

export type LoadState = "loading" | "ready" | "error";
export type AppRole = "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";

/** Catalog management is STAFF/ADMIN only — resolved from the real session. */
export function isShopManager(role: AppRole | null): boolean {
  return role === "STAFF" || role === "ADMIN";
}

export interface ShopIdentity {
  ready: boolean;
  role: AppRole | null;
}

/** Current role from the Auth.js session (UI gate; server re-checks anyway). */
export function useShopRole(): ShopIdentity {
  const { data: session, status } = useSession();
  if (status === "authenticated" && session?.user) {
    return { ready: true, role: session.user.role as AppRole };
  }
  return { ready: status === "unauthenticated", role: null };
}

function localToApi(p: LocalProduct): ApiProduct {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    imageUrl: p.imageUrl,
    category: p.category,
    stock: p.stock,
    isActive: p.isActive,
  };
}

export interface UseProductsResult {
  products: ApiProduct[];
  state: LoadState;
  /** Forces an online refetch (after admin add/edit/delete). No-op offline. */
  reload: () => void;
  /** Where the data came from — drives the offline read-only UX. */
  source: "server" | "mirror";
}

/**
 * Catalog data: online → GET /api/products (and mirror it into Dexie for later
 * offline viewing); offline → read the Dexie mirror via useLiveQuery.
 */
export function useProducts(online: boolean): UseProductsResult {
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const mirror = useLiveQuery(
    async () => {
      const rows = await db.products.toArray();
      return rows.sort((a, b) => a.name.localeCompare(b.name, "uk"));
    },
    [],
    undefined,
  );

  const [server, setServer] = useState<{
    products: ApiProduct[];
    state: LoadState;
  }>({ products: [], state: "loading" });

  useEffect(() => {
    if (!online) return;
    const ac = new AbortController();
    // No synchronous setState (avoids the set-state-in-effect cascade); the
    // state update + mirror write land in the async callbacks.
    getProducts(ac.signal)
      .then((products) => {
        setServer({ products, state: "ready" });
        // Refresh the offline mirror (clear stale + write the current set).
        const now = Date.now();
        const rows: LocalProduct[] = products.map((p) => ({
          ...p,
          lastMirroredAt: now,
        }));
        void db.transaction("rw", db.products, async () => {
          await db.products.clear();
          await db.products.bulkPut(rows);
        });
      })
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setServer({ products: [], state: "error" });
      });
    return () => ac.abort();
  }, [online, reloadKey]);

  if (online) return { ...server, reload, source: "server" };

  const products = (mirror ?? []).map(localToApi);
  return {
    products,
    state: mirror === undefined ? "loading" : "ready",
    reload,
    source: "mirror",
  };
}
