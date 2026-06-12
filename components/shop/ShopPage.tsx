"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { displayM } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import { useProducts, useShopRole, isShopManager } from "@/hooks/useShop";
import type { ApiProduct } from "@/lib/shop-types";
import { useCart } from "./CartContext";
import { ProductCard } from "./ProductCard";
import { CartDrawer } from "./CartDrawer";
import {
  useShopCategories,
  UNCATEGORIZED,
  UNCATEGORIZED_LABEL,
} from "./useShopCategories";
import { EmptyState, ErrorBanner, OfflineNotice, SkeletonGrid } from "./StatePanels";

export function ShopPage() {
  // CartProvider lives in the root layout — the cart must survive navigating
  // away from /shop and back, so it can't be scoped to this page.
  return <ShopInner />;
}

function ShopInner() {
  const { isOnline: online } = useOnlineStatus();
  const { add, items, count } = useCart();
  const { role } = useShopRole();
  // STAFF/ADMIN no longer manage products HERE — /shop is a pure storefront.
  // We only use the flag to hide the cart (they don't buy) and to show a small
  // "manage in admin" link. All management moved to /admin/products + /admin/categories.
  const canManage = isShopManager(role);

  const { products, state, reload, source } = useProducts(online);
  // Categories power the catalog FILTER only (management lives in the admin).
  const cats = useShopCategories(reload);

  const [category, setCategory] = useState<string>("all");
  const [cartOpen, setCartOpen] = useState(false);

  const uncategorizedCount = useMemo(
    () => products.filter((p) => !p.categoryId).length,
    [products],
  );
  const validIds = useMemo(
    () => new Set(cats.categories.map((c) => c.id)),
    [cats.categories],
  );
  const activeCategory =
    category !== "all" && category !== UNCATEGORIZED && !validIds.has(category)
      ? "all"
      : category;

  const filtered = useMemo(() => {
    const inCategory = (p: ApiProduct) => {
      if (activeCategory === "all") return true;
      if (activeCategory === UNCATEGORIZED) return !p.categoryId;
      return p.categoryId === activeCategory;
    };
    const list = products.filter(inCategory);
    const rank = (p: ApiProduct) => (p.isActive && p.inStock ? 1 : 0);
    return [...list].sort((a, b) => rank(b) - rank(a));
  }, [products, activeCategory]);

  const qtyById = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.product.id, i.qty);
    return m;
  }, [items]);

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
          {/* Managers manage in the admin panel — small link, not inline tools. */}
          {canManage && (
            <Link
              href="/admin/products"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 underline-offset-2 transition-colors hover:text-mint-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:rounded"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18" /></svg>
              Керувати в адмінці
            </Link>
          )}

          {/* Cart is buyer-only — STAFF/ADMIN don't purchase. */}
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

      {/* Category filter */}
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Фільтр за категорією">
        {[
          { value: "all", label: "Усі" },
          ...cats.categories.map((c) => ({ value: c.id, label: c.name })),
          ...(uncategorizedCount > 0
            ? [{ value: UNCATEGORIZED, label: UNCATEGORIZED_LABEL }]
            : []),
        ].map(({ value, label }) => {
          const active = activeCategory === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(value)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                active
                  ? "border-navy-900 bg-navy-900 text-white"
                  : "border-[color:var(--line-2)] bg-white text-navy-700 hover:border-navy-900",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Catalog */}
      {state === "loading" ? (
        <SkeletonGrid />
      ) : state === "error" ? (
        <ErrorBanner onRetry={reload} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Немає товарів"
          hint="Каталог поки порожній. Завітайте трохи згодом."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              disabled={!online}
              inCartQty={qtyById.get(p.id) ?? 0}
              onAdd={() => add(p)}
              // STAFF/ADMIN browse but don't buy here (no cart) → no add button.
              purchasable={!canManage}
            />
          ))}
        </div>
      )}

      {source === "mirror" && filtered.length > 0 && (
        <p className="mt-4 text-xs text-navy-400">
          Показано збережений каталог (офлайн). Оформлення доступне лише онлайн.
        </p>
      )}

      {!canManage && (
        <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} online={online} />
      )}
    </Container>
  );
}
