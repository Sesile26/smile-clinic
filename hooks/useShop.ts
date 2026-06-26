"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type LocalProduct } from "@/lib/db";
import { getProducts, getProductsPage, getCategories } from "@/lib/shop-client";
import type { ApiProduct } from "@/lib/shop-types";
import { UNCATEGORIZED_VALUE } from "@/lib/shop-types";
import { slugify } from "@/lib/slug";

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
    images: p.images ?? [],
    categoryId: p.categoryId,
    categoryName: p.categoryName,
    inStock: p.inStock,
    isActive: p.isActive,
    isFeatured: p.isFeatured,
  };
}

/** Map a wire product to its offline mirror row (text only). */
function apiToLocal(p: ApiProduct): LocalProduct {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    imageUrl: p.imageUrl,
    images: p.images ?? [],
    categoryId: p.categoryId,
    categoryName: p.categoryName,
    inStock: p.inStock,
    isActive: p.isActive,
    isFeatured: p.isFeatured ?? false,
    lastMirroredAt: Date.now(),
  };
}

/**
 * Mirror the FULL catalog text (all products) into Dexie, plus categories.
 * Called on every online /shop load so offline has the complete catalog ahead —
 * text is cheap. Images are NOT prefetched here; the Service Worker caches only
 * the photos the user actually views online. clear+bulkPut so server-removed
 * products don't linger offline.
 */
export async function mirrorCatalog(): Promise<void> {
  const [products, categories] = await Promise.all([
    getProducts(),
    getCategories(),
  ]);
  const now = Date.now();
  await db.transaction("rw", db.products, db.categories, async () => {
    await db.products.clear();
    await db.products.bulkPut(products.map(apiToLocal));
    await db.categories.clear();
    await db.categories.bulkPut(
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        productCount: c.productCount,
        lastMirroredAt: now,
      })),
    );
  });
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
        // Only the availability boolean is persisted — never the exact stock.
        void db.transaction("rw", db.products, async () => {
          await db.products.clear();
          await db.products.bulkPut(products.map(apiToLocal));
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

/** Offline mirror read with the same filters + in-stock-first ordering. */
function offlineFeed(
  rows: LocalProduct[],
  q: string,
  category: string,
): ApiProduct[] {
  const ql = q.trim().toLocaleLowerCase("uk");
  const list = rows.filter((p) => {
    // `category` is a SLUG; the mirror has no slug, so match the slugified
    // category name (same slugify the server/seed use).
    const inCat =
      category === "all"
        ? true
        : category === UNCATEGORIZED_VALUE
          ? !p.categoryId
          : slugify(p.categoryName ?? "") === category;
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
  items: ApiProduct[];
  total: number;
  hasMore: boolean;
  state: LoadState;
  loadingMore: boolean;
  loadMore: () => void;
  reload: () => void;
  /** Replace one already-loaded product in place (after a manager edit) without
   *  refetching the whole feed — keeps scroll position and loaded pages. */
  updateItem: (updated: ApiProduct) => void;
  /** Key of the active filters — ShopPage scrolls to top when it changes. */
  filterKey: string;
  /** Scroll Y to restore on mount (back navigation), or null. Consume once. */
  restoredScrollY: number | null;
}

/**
 * Storefront catalog feed. Filters (`query`, `category` slug) are URL-driven and
 * passed in by ShopPage. Online → cursor-paginated GET /api/products with
 * server-side search + category + stock-first sort (infinite scroll). Offline →
 * the Dexie mirror, filtered/sorted client-side (finite, no paging). Loading is
 * DERIVED (loadedKey vs requestKey) so the fetch effect never calls setState in
 * its body. A module snapshot restores loaded pages + scroll on back-navigation.
 */
export function useProductFeed({
  online,
  query,
  category,
}: {
  online: boolean;
  /** Already-debounced search string (from the URL ?q). */
  query: string;
  /** Category slug, "all", or the uncategorized sentinel (from the URL). */
  category: string;
}): UseProductFeed {
  const q = query.trim();
  const restored = feedSnapshot;
  // Restore only when the snapshot's filters match the current (URL) filters.
  const matches = !!restored && online && restored.query === q && restored.category === category;

  const [restoredScrollY] = useState<number | null>(() => (matches ? restored!.scrollY : null));

  const [items, setItems] = useState<ApiProduct[]>(matches ? restored!.items : []);
  const [cursor, setCursor] = useState<string | null>(matches ? restored!.nextCursor : null);
  const [hasMore, setHasMore] = useState<boolean>(matches ? restored!.hasMore : true);
  const [total, setTotal] = useState<number>(matches ? restored!.total : 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const requestKey = `${online}|${q}|${category}|${reloadKey}`;
  // Seed loadedKey from a matching snapshot so the first effect run is a no-op
  // (no refetch on back-navigation).
  const [loadedKey, setLoadedKey] = useState<string | null>(
    matches ? `true|${q}|${category}|0` : null,
  );
  const [errorKey, setErrorKey] = useState<string | null>(null);

  // First page (reset) on filter / connectivity change. No synchronous setState.
  useEffect(() => {
    if (loadedKey === requestKey) return;
    const ac = new AbortController();
    if (!online) {
      let cancelled = false;
      db.products.toArray().then((rows) => {
        if (cancelled) return;
        const list = offlineFeed(rows, q, category);
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
    getProductsPage({ q, category, limit: FEED_LIMIT }, ac.signal)
      .then((page) => {
        setItems(page.items);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setTotal(page.total);
        setLoadedKey(requestKey);
      })
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setErrorKey(requestKey);
      });
    return () => ac.abort();
  }, [requestKey, online, q, category, loadedKey]);

  // Mirror the FULL catalog text (all products + categories) into Dexie on each
  // online load, so offline /shop has everything ahead. Best-effort; images are
  // NOT prefetched — the SW caches only photos actually viewed online.
  useEffect(() => {
    if (!online) return;
    void mirrorCatalog().catch(() => {});
  }, [online]);

  const ready = loadedKey === requestKey && errorKey !== requestKey;

  const loadMore = useCallback(() => {
    if (!online || !ready || !hasMore || loadingMore || !cursor) return;
    setLoadingMore(true);
    getProductsPage({ q, category, cursor, limit: FEED_LIMIT })
      .then((page) => {
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...page.items.filter((p) => !seen.has(p.id))];
        });
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setTotal(page.total);
      })
      .catch(() => {
        /* keep current list; the sentinel can retry on next intersection */
      })
      .finally(() => setLoadingMore(false));
  }, [online, ready, hasMore, loadingMore, cursor, q, category]);

  const reload = useCallback(() => {
    setErrorKey(null);
    setReloadKey((k) => k + 1);
  }, []);

  // Patch a single loaded card in place (manager edit). The snapshot effect
  // below picks up the new `items`; also refresh the offline mirror.
  const updateItem = useCallback((updated: ApiProduct) => {
    setItems((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
    );
    // Offline mirror refreshes on the next online load (mirrorCatalog).
  }, []);

  // Keep the module snapshot current for back-navigation restore.
  useEffect(() => {
    feedSnapshot = {
      query: q,
      category,
      items,
      nextCursor: cursor,
      hasMore,
      total,
      scrollY: feedSnapshot?.scrollY ?? 0,
    };
  }, [q, category, items, cursor, hasMore, total]);

  const isError = errorKey === requestKey;
  const isLoading = !isError && loadedKey !== requestKey;
  const state: LoadState = isError ? "error" : isLoading ? "loading" : "ready";

  return {
    items,
    total,
    hasMore,
    state,
    loadingMore,
    loadMore,
    reload,
    updateItem,
    filterKey: `${q}|${category}`,
    restoredScrollY,
  };
}
