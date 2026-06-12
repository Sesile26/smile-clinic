"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useProducts } from "@/hooks/useShop";
import {
  createProduct,
  deleteProduct,
  updateProduct,
  ShopApiError,
} from "@/lib/shop-client";
import type { ApiProduct } from "@/lib/shop-types";
import { formatUAH } from "@/components/shop/data";
import { ProductFormModal, type ProductFormValues } from "@/components/shop/ProductFormModal";
import { useShopCategories } from "@/components/shop/useShopCategories";
import {
  EmptyState,
  ErrorBanner,
  OfflineNotice,
} from "@/components/shop/StatePanels";

/** Low-stock threshold for the warehouse view (≤ this → amber). */
const LOW_STOCK = 3;

/**
 * Product management for STAFF/ADMIN — admin table style (exact stock, low-stock
 * highlight, add/edit/delete). Reuses ProductFormModal and the shop API client
 * (createProduct/updateProduct/deleteProduct) and the category store for the
 * form select — no duplicated CRUD/forms.
 */
export function ProductsPage() {
  const { isOnline: online } = useOnlineStatus();
  const { products, state, reload } = useProducts(online);
  const cats = useShopCategories(reload);

  const [query, setQuery] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApiProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? products.filter((p) => p.name.toLowerCase().includes(q))
      : products;
    // Out-of-stock to the end, then by name.
    return [...list].sort((a, b) => {
      const av = a.inStock ? 1 : 0;
      const bv = b.inStock ? 1 : 0;
      if (av !== bv) return bv - av;
      return a.name.localeCompare(b.name, "uk");
    });
  }, [products, query]);

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
        err instanceof ShopApiError ? err.message : "Не вдалося зберегти товар.",
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
      setConfirmId(null);
      reload();
    } catch (err) {
      setActionError(
        err instanceof ShopApiError ? err.message : "Не вдалося видалити товар.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {/* Toolbar: search + add */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-[360px]">
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук за назвою"
            aria-label="Пошук товарів"
            className="w-full rounded-full border border-[color:var(--line-2)] bg-white py-2.5 pl-10 pr-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
          />
        </div>
        <button
          type="button"
          onClick={openAdd}
          disabled={!online}
          title={!online ? "Керування доступне лише онлайн" : undefined}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-navy-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Додати товар
        </button>
      </div>

      {!online && <OfflineNotice className="mb-4" message="Ви офлайн. Керування товарами доступне лише онлайн." />}

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      {state === "loading" ? (
        <TableSkeleton />
      ) : state === "error" ? (
        <ErrorBanner onRetry={reload} />
      ) : products.length === 0 ? (
        <EmptyState
          title="Ще немає товарів"
          hint="Додайте перший товар кнопкою «Додати товар»."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Нічого не знайдено"
          hint="Жоден товар не відповідає пошуку. Змініть запит."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-[color:var(--line)] bg-white md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[color:var(--line)] bg-cream/60 text-left text-xs font-medium uppercase tracking-[0.04em] text-navy-400">
                  <th scope="col" className="px-4 py-3">Назва</th>
                  <th scope="col" className="px-3 py-3">Категорія</th>
                  <th scope="col" className="px-3 py-3 text-right">Ціна</th>
                  <th scope="col" className="px-3 py-3">Залишок</th>
                  <th scope="col" className="px-3 py-3 text-right">Дії</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-[color:var(--line)] last:border-b-0">
                    <td className="px-4 py-3 font-medium text-navy-900">{p.name}</td>
                    <td className="px-3 py-3 text-navy-700">
                      {p.categoryName ?? <span className="italic text-navy-400">Без категорії</span>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-navy-900">
                      {formatUAH(p.price)}
                    </td>
                    <td className="px-3 py-3">
                      <StockCell stock={p.stock} />
                    </td>
                    <td className="px-3 py-3">
                      <RowActions
                        confirming={confirmId === p.id}
                        busy={busyId === p.id}
                        online={online}
                        onEdit={() => openEdit(p)}
                        onAskDelete={() => {
                          setActionError(null);
                          setConfirmId(p.id);
                        }}
                        onConfirmDelete={() => handleDelete(p.id)}
                        onCancelDelete={() => setConfirmId(null)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-3 md:hidden">
            {filtered.map((p) => (
              <li key={p.id} className="rounded-xl border border-[color:var(--line)] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-navy-900">{p.name}</div>
                    <div className="text-xs text-navy-400">
                      {p.categoryName ?? "Без категорії"}
                    </div>
                  </div>
                  <span className="shrink-0 tabular-nums font-medium text-navy-900">
                    {formatUAH(p.price)}
                  </span>
                </div>
                <div className="mt-2">
                  <StockCell stock={p.stock} />
                </div>
                <div className="mt-3 border-t border-[color:var(--line)] pt-3">
                  <RowActions
                    confirming={confirmId === p.id}
                    busy={busyId === p.id}
                    online={online}
                    onEdit={() => openEdit(p)}
                    onAskDelete={() => {
                      setActionError(null);
                      setConfirmId(p.id);
                    }}
                    onConfirmDelete={() => handleDelete(p.id)}
                    onCancelDelete={() => setConfirmId(null)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {formOpen && (
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
    </>
  );
}

function StockCell({ stock }: { stock?: number }) {
  const n = stock ?? 0;
  const tone =
    n <= 0 ? "text-red-600" : n <= LOW_STOCK ? "text-amber-600" : "text-navy-700";
  return (
    <span className={cn("text-sm font-medium tabular-nums", tone)}>
      {n <= 0 ? "Немає на складі" : `Залишилось: ${n}`}
    </span>
  );
}

function RowActions({
  confirming,
  busy,
  online,
  onEdit,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  confirming: boolean;
  busy: boolean;
  online: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-navy-700">Видалити?</span>
        <button
          type="button"
          onClick={onConfirmDelete}
          disabled={busy || !online}
          className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
        >
          Так
        </button>
        <button
          type="button"
          onClick={onCancelDelete}
          disabled={busy}
          className="rounded-full border border-[color:var(--line-2)] px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:opacity-50"
        >
          Ні
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onEdit}
        disabled={!online}
        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line-2)] px-3 py-1.5 text-xs font-medium text-navy-900 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
        Редагувати
      </button>
      <button
        type="button"
        onClick={onAskDelete}
        disabled={!online}
        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line-2)] px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:border-red-600 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
        Видалити
      </button>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="overflow-hidden rounded-xl border border-[color:var(--line)] bg-white"
    >
      <span className="sr-only">Завантаження товарів…</span>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-[color:var(--line)] px-4 py-4 last:border-b-0">
          <div className="h-4 w-40 animate-pulse rounded bg-bone/70" />
          <div className="hidden h-4 w-24 animate-pulse rounded bg-bone/50 sm:block" />
          <div className="ml-auto h-4 w-16 animate-pulse rounded bg-bone/60" />
          <div className="h-7 w-28 animate-pulse rounded-full bg-bone/50" />
        </div>
      ))}
    </div>
  );
}
