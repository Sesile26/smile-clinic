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
  type Product,
  type ShopRole,
} from "./data";
import { CartProvider, useCart } from "./CartContext";
import { ProductCard } from "./ProductCard";
import { CartDrawer } from "./CartDrawer";
import { DemoControls } from "./DemoControls";
import { ProductFormModal, type ProductFormValues } from "./ProductFormModal";
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

  // Role is emulated by a local toggle for now — real roles (session) come with
  // integration. Buyers never see the manage UI.
  const [role, setRole] = useState<ShopRole>("buyer");
  const isAdmin = role === "admin";

  const [demoState, setDemoState] = useState<DemoState>("ready");
  const [forceOffline, setForceOffline] = useState(false);
  const [category, setCategory] = useState<Category | "all">("all");
  const [cartOpen, setCartOpen] = useState(false);

  // Catalog lives in local state so admin add/edit/delete is reflected
  // immediately. MOCK ONLY — persisting to the DB is wired during integration.
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const online = isOnline && !forceOffline;

  const filtered = useMemo(
    () =>
      category === "all"
        ? products
        : products.filter((p) => p.category === category),
    [products, category],
  );

  // product id → qty in cart (for the card's "У кошику · N").
  const qtyById = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.product.id, i.qty);
    return m;
  }, [items]);

  // ── Admin CRUD (local mock) ────────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setFormOpen(true);
  };
  const handleSave = (values: ProductFormValues) => {
    setProducts((prev) =>
      editing
        ? prev.map((p) => (p.id === editing.id ? { ...p, ...values } : p))
        : [{ id: `p-${crypto.randomUUID().slice(0, 8)}`, ...values }, ...prev],
    );
    setFormOpen(false);
    setEditing(null);
  };
  const handleDelete = (id: string) =>
    setProducts((prev) => prev.filter((p) => p.id !== id));

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
            {isAdmin
              ? "Режим керування: додавайте, редагуйте та видаляйте товари. Зміни наразі лише локальні."
              : "Засоби догляду, які ми рекомендуємо пацієнтам. Оплата при отриманні — самовивіз або Нова Пошта."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <RoleToggle role={role} onChange={setRole} />
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative inline-flex shrink-0 items-center gap-2 rounded-full border border-[color:var(--line-2)] bg-white px-4 py-2.5 text-sm font-medium text-navy-900 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
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
      </div>

      <DemoControls
        demoState={demoState}
        onDemoState={setDemoState}
        forceOffline={forceOffline}
        onForceOffline={setForceOffline}
        online={isOnline}
      />

      {!online && demoState === "ready" && <OfflineNotice className="mb-5" />}

      {/* Toolbar: category filter + (admin) add button */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="Фільтр за категорією"
          className="flex flex-wrap gap-2"
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

        {isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-navy-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Додати товар
          </button>
        )}
      </div>

      {/* Catalog */}
      {demoState === "loading" ? (
        <SkeletonGrid />
      ) : demoState === "error" ? (
        <ErrorBanner onRetry={() => setDemoState("ready")} />
      ) : demoState === "empty" || filtered.length === 0 ? (
        <EmptyState
          title="Немає товарів"
          hint={
            isAdmin
              ? "Додайте перший товар кнопкою «Додати товар»."
              : "У цій категорії поки порожньо. Спробуйте іншу категорію."
          }
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
              role={role}
              onEdit={() => openEdit(p)}
              onDelete={() => handleDelete(p.id)}
            />
          ))}
        </div>
      )}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        online={online}
      />

      {/* Admin-only product form (add/edit). Mock — see handleSave.
          Mounted only while open and keyed by product id so the form prefills
          from its lazy initial state (no prop→state effect). */}
      {isAdmin && formOpen && (
        <ProductFormModal
          key={editing?.id ?? "new"}
          initial={editing}
          onSave={handleSave}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}
    </Container>
  );
}

function RoleToggle({
  role,
  onChange,
}: {
  role: ShopRole;
  onChange: (r: ShopRole) => void;
}) {
  const options: { value: ShopRole; label: string }[] = [
    { value: "buyer", label: "Я покупець" },
    { value: "admin", label: "Я admin-staff" },
  ];
  return (
    <div
      role="group"
      aria-label="Режим перегляду"
      className="inline-flex shrink-0 rounded-full bg-cream p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={role === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
            role === o.value
              ? "bg-navy-900 text-white"
              : "text-navy-400 hover:text-navy-900",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
