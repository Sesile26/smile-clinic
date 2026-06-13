"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type LocalProduct } from "@/lib/db";
import { getProducts, getProductsPage } from "@/lib/shop-client";
import type { ApiProduct } from "@/lib/shop-types";
import { UNCATEGORIZED_VALUE } from "@/lib/shop-types";

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
  // The offline mirror only knows availability, not the exact count (stock is
  // staff-only and never persisted). Managing the catalog is online-only.
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    imageUrl: p.imageUrl,
    categoryId: p.categoryId,
    categoryName: p.categoryName,
    inStock: p.inStock,
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
        // Persist only the availability boolean — never the exact stock count,
        // even for a staff session (defence in depth on a shared device).
        const now = Date.now();
        const rows: LocalProduct[] = products.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          imageUrl: p.imageUrl,
          categoryId: p.categoryId,
          categoryName: p.categoryName,
          inStock: p.inStock,
          isActive: p.isActive,
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

// ─── Storefront infinite-scroll feed ─────────────────────────────────────────

const FEED_LIMIT = 24;

/**
 * Module-level snapshot of the last feed render — survives client-side
 * navigation (the JS module stays alive), so returning to /shop restores the
 * loaded pages, filters and scroll position WITHOUT refetching from page one.
 * A full reload clears it (acceptable).
 */
interface FeedSnapshot {
  query: string;
  category: string;
  items: ApiProduct[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
  scrollY: number;
}
let feedSnapshot: FeedSnapshot | null = null;

/** Save the scroll position into the snapshot (called when leaving /shop). */
export function saveFeedScroll(y: number): void {
  if (feedSnapshot) feedSnapshot.scrollY = y;
}

/** Merge loaded pages into the Dexie mirror (no clear) so offline /shop shows
 *  what was browsed. The exact stock count is never persisted. */
function mirrorMerge(products: ApiProduct[]): void {
  const now = Date.now();
  const rows: LocalProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    imageUrl: p.imageUrl,
    categoryId: p.categoryId,
    categoryName: p.categoryName,
    inStock: p.inStock,
    isActive: p.isActive,
    lastMirroredAt: now,
  }));
  void db.products.bulkPut(rows).catch(() => {});
}

/** Offline mirror read with the same filters + in-stock-first ordering. */
function offlineFeed(
  rows: LocalProduct[],
  q: string,
  category: string,
): ApiProduct[] {
  const ql = q.trim().toLocaleLowerCase("uk");
  const list = rows.filter((p) => {
    const inCat =
      category === "all"
        ? true
        : category === UNCATEGORIZED_VALUE
          ? !p.categoryId
          : p.categoryId === category;
    if (!inCat) return false;
    if (!ql) return true;
    return (
      p.name.toLocaleLowerCase("uk").includes(ql) ||
      (p.description ?? "").toLocaleLowerCase("uk").includes(ql)
    );
  });
  const rank = (p: LocalProduct) => (p.inStock ? 1 : 0);
  return [...list]
    .sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name, "uk"))
    .map(localToApi);
}

export interface UseProductFeed {
  query: string;
  setQuery: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  items: ApiProduct[];
  total: number;
  hasMore: boolean;
  state: LoadState;
  loadingMore: boolean;
  loadMore: () => void;
  reload: () => void;
  /** Key of the active filters — ShopPage scrolls to top when it changes. */
  filterKey: string;
  /** Scroll Y to restore on mount (back navigation), or null. Consume once. */
  restoredScrollY: number | null;
}

/**
 * Storefront catalog feed. Online → cursor-paginated GET /api/products with
 * server-side search + category + stock-first sort (infinite scroll). Offline →
 * the Dexie mirror, filtered/sorted client-side (finite, no paging). Loading is
 * DERIVED (loadedKey vs requestKey) so the fetch effect never calls setState in
 * its body.
 */
export function useProductFeed(online: boolean): UseProductFeed {
  const restored = feedSnapshot;
  const [restoredScrollY] = useState<number | null>(() =>
    restored && online ? restored.scrollY : null,
  );

  const [query, setQuery] = useState(restored?.query ?? "");
  const [category, setCategory] = useState(restored?.category ?? "all");
  const [effectiveQ, setEffectiveQ] = useState((restored?.query ?? "").trim());

  const [items, setItems] = useState<ApiProduct[]>(restored?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(restored?.nextCursor ?? null);
  const [hasMore, setHasMore] = useState<boolean>(restored?.hasMore ?? true);
  const [total, setTotal] = useState<number>(restored?.total ?? 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const requestKey = `${online}|${effectiveQ}|${category}|${reloadKey}`;
  // Seed loadedKey from the restored snapshot so the first effect run is a no-op
  // (no refetch on back-navigation).
  const [loadedKey, setLoadedKey] = useState<string | null>(
    restored && online
      ? `true|${(restored.query ?? "").trim()}|${restored.category}|0`
      : null,
  );
  const [errorKey, setErrorKey] = useState<string | null>(null);

  // Debounce the search box (300ms) → effectiveQ drives the request.
  useEffect(() => {
    const t = window.setTimeout(() => setEffectiveQ(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  // First page (reset) on filter / connectivity change. No synchronous setState.
  useEffect(() => {
    if (loadedKey === requestKey) return;
    const ac = new AbortController();
    if (!online) {
      let cancelled = false;
      db.products.toArray().then((rows) => {
        if (cancelled) return;
        const list = offlineFeed(rows, effectiveQ, category);
        setItems(list);
        setCursor(null);
        setHasMore(false);
        setTotal(list.length);
        setLoadedKey(requestKey);
      });
      return () => {
        cancelled = true;
      };
    }
    getProductsPage({ q: effectiveQ, category, limit: FEED_LIMIT }, ac.signal)
      .then((page) => {
        setItems(page.items);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setTotal(page.total);
        setLoadedKey(requestKey);
        mirrorMerge(page.items);
      })
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setErrorKey(requestKey);
      });
    return () => ac.abort();
  }, [requestKey, online, effectiveQ, category, loadedKey]);

  const ready = loadedKey === requestKey && errorKey !== requestKey;

  // Re-created when its inputs change; the observer effect re-subscribes to it.
  const loadMore = useCallback(() => {
    if (!online || !ready || !hasMore || loadingMore || !cursor) return;
    setLoadingMore(true);
    getProductsPage({ q: effectiveQ, category, cursor, limit: FEED_LIMIT })
      .then((page) => {
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...page.items.filter((p) => !seen.has(p.id))];
        });
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setTotal(page.total);
        mirrorMerge(page.items);
      })
      .catch(() => {
        /* keep current list; the sentinel can retry on next intersection */
      })
      .finally(() => setLoadingMore(false));
  }, [online, ready, hasMore, loadingMore, cursor, effectiveQ, category]);

  const reload = useCallback(() => {
    setErrorKey(null);
    setReloadKey((k) => k + 1);
  }, []);

  // Keep the module snapshot current for back-navigation restore.
  useEffect(() => {
    feedSnapshot = {
      query,
      category,
      items,
      nextCursor: cursor,
      hasMore,
      total,
      scrollY: feedSnapshot?.scrollY ?? 0,
    };
  }, [query, category, items, cursor, hasMore, total]);

  const isError = errorKey === requestKey;
  const isLoading = !isError && loadedKey !== requestKey;
  const state: LoadState = isError ? "error" : isLoading ? "loading" : "ready";

  return {
    query,
    setQuery,
    category,
    setCategory,
    items,
    total,
    hasMore,
    state,
    loadingMore,
    loadMore,
    reload,
    filterKey: `${effectiveQ}|${category}`,
    restoredScrollY,
  };
}
