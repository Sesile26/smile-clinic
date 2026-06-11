"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { displayM } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import { useProducts, useShopRole, isShopManager } from "@/hooks/useShop";
import {
  createProduct,
  deleteProduct,
  updateProduct,
  ShopApiError,
} from "@/lib/shop-client";
import type { ApiProduct } from "@/lib/shop-types";
import { useCart } from "./CartContext";
import { ProductCard } from "./ProductCard";
import { CartDrawer } from "./CartDrawer";
import { ProductFormModal, type ProductFormValues } from "./ProductFormModal";
import { CategoriesModal } from "./CategoriesModal";
import {
  useShopCategories,
  UNCATEGORIZED,
  UNCATEGORIZED_LABEL,
} from "./useShopCategories";
import {
  EmptyState,
  ErrorBanner,
  OfflineNotice,
  SkeletonGrid,
} from "./StatePanels";

export function ShopPage() {
  // CartProvider lives in the root layout — the cart must survive navigating
  // away from /shop and back, so it can't be scoped to this page.
  return <ShopInner />;
}

function ShopInner() {
  const { isOnline: online } = useOnlineStatus();
  const { add, items, count } = useCart();
  const { role } = useShopRole();
  const canManage = isShopManager(role); // STAFF/ADMIN, from the session

  const { products, state, reload, source } = useProducts(online);

  // Real category store (GET /api/categories) — feeds the manage modal, the
  // catalog filter, and the product-form select. After a category mutation it
  // refetches AND triggers a catalog reload (passed as onMutated) so renamed/
  // reassigned products show up immediately.
  const cats = useShopCategories(reload);

  const [category, setCategory] = useState<string>("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);

  // Admin form + delete state (API-backed; reload() refetches after a change).
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApiProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Products with no category — drives the "Без категорії" filter chip + count.
  const uncategorizedCount = useMemo(
    () => products.filter((p) => !p.categoryId).length,
    [products],
  );

  const validIds = useMemo(
    () => new Set(cats.categories.map((c) => c.id)),
    [cats.categories],
  );

  // If the selected category was renamed/deleted out from under us, fall back
  // to "all" so the catalog never shows an empty, stale filter.
  const activeCategory =
    category !== "all" && category !== UNCATEGORIZED && !validIds.has(category)
      ? "all"
      : category;

  const filtered = useMemo(() => {
    const inCategory = (p: ApiProduct) => {
      if (activeCategory === "all") return true;
      if (activeCategory === UNCATEGORIZED) return !p.categoryId;
      return p.categoryId === activeCategory; // match by id, not name
    };
    const list = products.filter(inCategory);
    // Availability sort: in-stock (active) first, out-of-stock last. Array.sort
    // is stable, so the existing order is preserved WITHIN each group.
    const rank = (p: ApiProduct) => (p.isActive && p.inStock ? 1 : 0);
    return [...list].sort((a, b) => rank(b) - rank(a));
  }, [products, activeCategory]);

  const qtyById = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.product.id, i.qty);
    return m;
  }, [items]);

  // ── Admin CRUD via the API ──────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    setSaveError(null);
    setFormOpen(true);
  };
  const openEdit = (p: ApiProduct) => {
    setEditing(p);
    setSaveError(null);
    setFormOpen(true);
  };
  const handleSave = async (values: ProductFormValues) => {
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) await updateProduct(editing.id, values);
      else await createProduct(values);
      setFormOpen(false);
      setEditing(null);
      reload();
    } catch (err) {
      setSaveError(
        err instanceof ShopApiError
          ? err.message
          : "Не вдалося зберегти товар.",
      );
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      await deleteProduct(id);
      reload();
    } catch (err) {
      setActionError(
        err instanceof ShopApiError
          ? err.message
          : "Не вдалося видалити товар.",
      );
    } finally {
      setBusyId(null);
    }
  };

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
            {canManage
              ? "Режим персоналу: керуйте товарами. Покупці бачать лише активні позиції."
              : "Засоби догляду, які ми рекомендуємо пацієнтам. Оплата при отриманні — самовивіз або Нова Пошта."}
          </p>
        </div>

        {/* Cart is buyer-only — STAFF/ADMIN don't purchase, so no cart UI. */}
        {!canManage && (
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
        )}
      </div>

      {!online && <OfflineNotice className="mb-5" />}

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      {/* Toolbar: category filter + (admin) manage buttons */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="Фільтр за категорією"
          className="flex flex-wrap gap-2"
        >
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

        {canManage && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setCatsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line-2)] bg-white px-4 py-2 text-sm font-medium text-navy-900 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18" /></svg>
              Категорії
            </button>
            <button
              type="button"
              onClick={openAdd}
              disabled={!online}
              title={!online ? "Керування доступне лише онлайн" : undefined}
              className="inline-flex items-center gap-1.5 rounded-full bg-navy-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Додати товар
            </button>
          </div>
        )}
      </div>

      {/* Catalog */}
      {state === "loading" ? (
        <SkeletonGrid />
      ) : state === "error" ? (
        <ErrorBanner onRetry={reload} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Немає товарів"
          hint={
            canManage
              ? "Додайте перший товар кнопкою «Додати товар»."
              : "Каталог поки порожній. Завітайте трохи згодом."
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
              canManage={canManage && online}
              busy={busyId === p.id}
              onEdit={() => openEdit(p)}
              onDelete={() => handleDelete(p.id)}
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

      {/* Admin-only product form. Mounted only while open, keyed by id so the
          form prefills from its lazy initial state (no prop→state effect). */}
      {canManage && formOpen && (
        <ProductFormModal
          key={editing?.id ?? "new"}
          initial={editing}
          categories={cats.categories}
          submitting={saving}
          error={saveError}
          onSave={handleSave}
          onClose={() => {
            if (saving) return;
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}

      {/* Admin-only category manager (mounted only while open). */}
      {canManage && catsOpen && (
        <CategoriesModal
          categories={cats.categories}
          uncategorizedCount={uncategorizedCount}
          state={cats.state}
          onAdd={cats.add}
          onRename={cats.rename}
          onRemove={cats.remove}
          onReload={cats.reload}
          onClose={() => setCatsOpen(false)}
        />
      )}
    </Container>
  );
}
