"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { displayM } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import {
  useProductFeed,
  useShopRole,
  isShopManager,
  saveFeedScroll,
} from "@/hooks/useShop";
import { UNCATEGORIZED_VALUE } from "@/lib/shop-types";
import { useCart } from "./CartContext";
import { ProductCard } from "./ProductCard";
import { CartDrawer } from "./CartDrawer";
import { useShopCategories, UNCATEGORIZED_LABEL } from "./useShopCategories";
import {
  EmptyState,
  ErrorBanner,
  OfflineNotice,
  SkeletonCards,
  SkeletonGrid,
} from "./StatePanels";

export function ShopPage() {
  // CartProvider lives in the root layout — the cart must survive navigating
  // away from /shop and back, so it can't be scoped to this page. ShopInner
  // reads the URL (useSearchParams) → wrap it in Suspense.
  return (
    <Suspense fallback={<Container className="py-10 sm:py-14"><SkeletonGrid /></Container>}>
      <ShopInner />
    </Suspense>
  );
}

const SEARCH_DEBOUNCE_MS = 300;

function ShopInner() {
  const { isOnline: online } = useOnlineStatus();
  const { add, items, count } = useCart();
  const { role } = useShopRole();
  const canManage = isShopManager(role);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Filters live in the URL ───────────────────────────────────────────────
  const urlQ = searchParams.get("q") ?? "";
  const categorySlug = searchParams.get("category") ?? "all";

  const buildUrl = (next: { q?: string; category?: string }) => {
    const q = (next.q ?? urlQ).trim();
    const category = next.category ?? categorySlug;
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (category && category !== "all") sp.set("category", category);
    const qs = sp.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  };

  // Controlled search box (debounced → URL). Initialised from the URL.
  const [searchInput, setSearchInput] = useState(urlQ);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchInput.trim() !== urlQ.trim()) {
        router.replace(buildUrl({ q: searchInput }));
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const feed = useProductFeed({ online, query: urlQ, category: categorySlug });
  const cats = useShopCategories(feed.reload);

  const [cartOpen, setCartOpen] = useState(false);

  const qtyById = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.product.id, i.qty);
    return m;
  }, [items]);

  // ── Restore scroll on back-navigation; save it when leaving ───────────────
  useEffect(() => {
    if (feed.restoredScrollY != null) window.scrollTo(0, feed.restoredScrollY);
    return () => saveFeedScroll(window.scrollY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Scroll to top when the filters change (but NOT on the initial restore) ─
  const filterKeyRef = useRef(feed.filterKey);
  useEffect(() => {
    if (filterKeyRef.current !== feed.filterKey) {
      filterKeyRef.current = feed.filterKey;
      window.scrollTo({ top: 0 });
    }
  }, [feed.filterKey]);

  // ── Infinite scroll: observe the sentinel; load the next page on view ──────
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMore = feed.loadMore;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !online || !feed.hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [online, feed.hasMore, feed.loadingMore, feed.state, loadMore]);

  const hasFilters = urlQ.trim() !== "" || categorySlug !== "all";

  const categoryOptions = [
    { value: "all", label: "Усі" },
    ...cats.categories.map((c) => ({ value: c.slug, label: c.name })),
    { value: UNCATEGORIZED_VALUE, label: UNCATEGORIZED_LABEL },
  ];

  return (
    <Container className="py-10 sm:py-14">
      {/* Header */}
      <div className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-mint-100 px-3 py-1 text-xs font-medium text-mint-600">
            Магазин
          </span>
          <h1 className={cn(displayM, "text-navy-900")}>
            Магазин <em className="italic text-mint-600">клініки</em>
          </h1>
          <p className="mt-2 max-w-[52ch] text-[15px] leading-[1.55] text-navy-400">
            Засоби догляду, які ми рекомендуємо пацієнтам. Оплата при отриманні —
            самовивіз або Нова Пошта.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3 self-start lg:self-auto">
          {canManage && (
            <Link
              href="/admin/products"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 underline-offset-2 transition-colors hover:text-mint-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:rounded"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18" /></svg>
              Керувати в адмінці
            </Link>
          )}

          {!canManage && (
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative inline-flex items-center gap-2 rounded-full border border-[color:var(--line-2)] bg-white px-4 py-2.5 text-sm font-medium text-navy-900 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
              aria-label={`Відкрити кошик, товарів: ${count}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
              </svg>
              Кошик
              {count > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-mint px-1 text-xs font-semibold tabular-nums text-navy-900">
                  {count}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {!online && <OfflineNotice className="mb-5" />}

      {/* Search */}
      <div className="mb-4">
        <label htmlFor="shop-search" className="sr-only">Пошук товарів</label>
        <div className="relative max-w-[420px]">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            id="shop-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Пошук за назвою або описом"
            className="w-full rounded-full border border-[color:var(--line-2)] bg-white py-2.5 pl-10 pr-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
          />
        </div>
      </div>

      {/* Category filter — selection updates the URL (?category=<slug>) */}
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Фільтр за категорією">
        {categoryOptions.map(({ value, label }) => {
          const active = categorySlug === value;
          return (
            <Link
              key={value}
              href={buildUrl({ category: value })}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                active
                  ? "border-navy-900 bg-navy-900 text-white"
                  : "border-[color:var(--line-2)] bg-white text-navy-700 hover:border-navy-900",
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Catalog */}
      {feed.state === "loading" ? (
        <SkeletonGrid />
      ) : feed.state === "error" ? (
        <ErrorBanner onRetry={feed.reload} />
      ) : feed.items.length === 0 ? (
        hasFilters ? (
          <EmptyState title="Нічого не знайдено" hint="Спробуйте інший запит або категорію." />
        ) : (
          <EmptyState title="Немає товарів" hint="Каталог поки порожній. Завітайте трохи згодом." />
        )
      ) : (
        <>
          <p className="mb-3 text-xs tabular-nums text-navy-400">
            Показано {feed.items.length} із {feed.total}
          </p>

          {/* PERF: the grid appends every loaded page, so the DOM grows with
              how far the user scrolls. Fine for demo-sized catalogs; for a very
              large catalog add windowing (e.g. @tanstack/react-virtual). */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {feed.items.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                disabled={!online}
                inCartQty={qtyById.get(p.id) ?? 0}
                onAdd={() => add(p)}
                purchasable={!canManage}
              />
            ))}
            {feed.loadingMore && <SkeletonCards count={3} />}
          </div>

          {online && feed.hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-px" />}

          {!feed.hasMore && (
            <p className="mt-8 text-center text-sm text-navy-400">Це всі товари</p>
          )}
          {!online && (
            <p className="mt-4 text-xs text-navy-400">
              Показано збережений каталог (офлайн). Оформлення доступне лише онлайн.
            </p>
          )}

          <p aria-live="polite" className="sr-only">
            {feed.loadingMore
              ? "Завантаження товарів…"
              : `Показано ${feed.items.length} із ${feed.total} товарів`}
          </p>
        </>
      )}

      {!canManage && (
        <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} online={online} />
      )}
    </Container>
  );
}
