"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { displayM } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import {
  CATEGORIES,
  PRODUCTS,
  type Category,
  type DemoState,
} from "./data";
import { CartProvider, useCart } from "./CartContext";
import { ProductCard } from "./ProductCard";
import { CartDrawer } from "./CartDrawer";
import { DemoControls } from "./DemoControls";
import {
  EmptyState,
  ErrorBanner,
  OfflineNotice,
  SkeletonGrid,
} from "./StatePanels";

export function ShopPage() {
  return (
    <CartProvider>
      <ShopInner />
    </CartProvider>
  );
}

function ShopInner() {
  const { isOnline } = useOnlineStatus();
  const { add, items, count } = useCart();

  const [demoState, setDemoState] = useState<DemoState>("ready");
  const [forceOffline, setForceOffline] = useState(false);
  const [category, setCategory] = useState<Category | "all">("all");
  const [cartOpen, setCartOpen] = useState(false);

  const online = isOnline && !forceOffline;

  const products = useMemo(
    () =>
      category === "all"
        ? PRODUCTS
        : PRODUCTS.filter((p) => p.category === category),
    [category],
  );

  // Quick lookup: product id → qty in cart (for the card's "У кошику · N").
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

        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="relative inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-[color:var(--line-2)] bg-white px-4 py-2.5 text-sm font-medium text-navy-900 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint lg:self-auto"
          aria-label={`Відкрити кошик, товарів: ${count}`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
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
      </div>

      <DemoControls
        demoState={demoState}
        onDemoState={setDemoState}
        forceOffline={forceOffline}
        onForceOffline={setForceOffline}
        online={isOnline}
      />

      {!online && demoState === "ready" && <OfflineNotice className="mb-5" />}

      {/* Category filter */}
      <div
        role="group"
        aria-label="Фільтр за категорією"
        className="mb-6 flex flex-wrap gap-2"
      >
        {(["all", ...CATEGORIES] as const).map((c) => {
          const active = category === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                active
                  ? "border-navy-900 bg-navy-900 text-white"
                  : "border-[color:var(--line-2)] bg-white text-navy-700 hover:border-navy-900",
              )}
            >
              {c === "all" ? "Усі" : c}
            </button>
          );
        })}
      </div>

      {/* Catalog */}
      {demoState === "loading" ? (
        <SkeletonGrid />
      ) : demoState === "error" ? (
        <ErrorBanner onRetry={() => setDemoState("ready")} />
      ) : demoState === "empty" || products.length === 0 ? (
        <EmptyState
          title="Немає товарів"
          hint="У цій категорії поки порожньо. Спробуйте іншу категорію."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              disabled={!online}
              inCartQty={qtyById.get(p.id) ?? 0}
              onAdd={() => add(p)}
            />
          ))}
        </div>
      )}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        online={online}
      />
    </Container>
  );
}
