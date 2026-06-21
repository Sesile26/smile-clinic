"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  createProduct,
  deleteProduct,
  updateProduct,
  ShopApiError,
} from "@/lib/shop-client";
import {
  getAdminProducts,
  PRODUCT_DEFAULT_PAGE_SIZE,
  PRODUCT_PAGE_SIZES,
  type AdminProductsPage,
} from "@/lib/admin-products";
import { UNCATEGORIZED_VALUE, type ApiProduct } from "@/lib/shop-types";
import { formatUAH } from "@/components/shop/data";
import { ProductFormModal, type ProductFormValues } from "@/components/shop/ProductFormModal";
import {
  useShopCategories,
  UNCATEGORIZED_LABEL,
} from "@/components/shop/useShopCategories";
import {
  EmptyState,
  ErrorBanner,
  OfflineNotice,
} from "@/components/shop/StatePanels";

/** Low-stock threshold for the warehouse view (≤ this → amber). */
const LOW_STOCK = 3;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Product management for STAFF/ADMIN — admin table with OFFSET pagination +
 * category filter (page/pageSize/category/q live in the URL, like the other
 * admin tables). The server (/api/admin/products) does filter → featured/stock
 * sort → page slice over the whole DB (incl. hidden products). Reuses
 * ProductFormModal, the category store, and the shop API client for CRUD +
 * the featured toggle. Management is online-only.
 */
export function ProductsPage() {
  const { isOnline: online } = useOnlineStatus();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── URL = source of truth ──────────────────────────────────────────────────
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize = (PRODUCT_PAGE_SIZES as readonly number[]).includes(rawSize)
    ? rawSize
    : PRODUCT_DEFAULT_PAGE_SIZE;
  const category = searchParams.get("category") ?? "all";
  const urlQ = searchParams.get("q") ?? "";

  const hrefFor = (next: {
    page?: number;
    pageSize?: number;
    category?: string;
    q?: string;
  }) => {
    const p = next.page ?? page;
    const ps = next.pageSize ?? pageSize;
    const cat = next.category ?? category;
    const qq = (next.q ?? urlQ).trim();
    const sp = new URLSearchParams();
    if (qq) sp.set("q", qq);
    if (cat && cat !== "all") sp.set("category", cat);
    if (p > 1) sp.set("page", String(p));
    if (ps !== PRODUCT_DEFAULT_PAGE_SIZE) sp.set("pageSize", String(ps));
    const s = sp.toString();
    return `${pathname}${s ? `?${s}` : ""}`;
  };

  // ── Data + derived loading ────────────────────────────────────────────────
  const [data, setData] = useState<AdminProductsPage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = JSON.stringify({ q: urlQ, page, pageSize, category, reloadKey });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const reload = () => {
    setErrorKey(null);
    setReloadKey((k) => k + 1);
  };
  // Category store powers the filter chips AND the form's category select.
  // A category rename/delete refetches the product page too.
  const cats = useShopCategories(reload);

  // Search box (local) → debounced into the URL, resetting to page 1.
  const [query, setQuery] = useState(urlQ);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (query.trim() !== urlQ.trim()) {
        router.replace(hrefFor({ q: query, page: 1 }));
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (!online) return; // management is online-only
    const ac = new AbortController();
    getAdminProducts({ q: urlQ, page, pageSize, category }, ac.signal)
      .then((d) => {
        // Page beyond range (filter narrowed results) → jump to the last page.
        if (d.total > 0 && page > d.totalPages) {
          router.replace(hrefFor({ page: d.totalPages }));
          return;
        }
        setData(d);
        setLoadedKey(requestKey);
      })
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setErrorKey(requestKey);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, online]);

  // ── Modal + per-row action state ──────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApiProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
  // Toggle "featured" — one PATCH, then refresh the page.
  const toggleFeatured = async (p: ApiProduct) => {
    setBusyId(p.id);
    setActionError(null);
    try {
      await updateProduct(p.id, { isFeatured: !p.isFeatured });
      reload();
    } catch (err) {
      setActionError(
        err instanceof ShopApiError ? err.message : "Не вдалося оновити товар.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const isError = errorKey === requestKey;
  const firstLoading = online && data === null && !isError;
  const pageLoading = online && data !== null && loadedKey !== requestKey && !isError;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const hasFilters = category !== "all" || urlQ.trim() !== "";

  const categoryOptions = [
    { value: "all", label: "Усі категорії" },
    ...cats.categories.map((c) => ({ value: c.slug, label: c.name })),
    { value: UNCATEGORIZED_VALUE, label: UNCATEGORIZED_LABEL },
  ];

  return (
    <>
      {/* Toolbar: search + add */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

      {!online ? (
        <OfflineNotice message="Ви офлайн. Керування товарами доступне лише онлайн." />
      ) : (
        <>
          {/* Category filter — selection updates ?category and resets to page 1 */}
          <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Фільтр за категорією">
            {categoryOptions.map(({ value, label }) => {
              const active = category === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => router.push(hrefFor({ category: value, page: 1 }))}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
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

          {actionError && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              {actionError}
            </div>
          )}

          {firstLoading ? (
            <TableSkeleton />
          ) : isError ? (
            <ErrorBanner onRetry={reload} />
          ) : total === 0 ? (
            hasFilters ? (
              <EmptyState
                title="Нічого не знайдено"
                hint="Жоден товар не відповідає фільтру. Змініть категорію або запит."
              />
            ) : (
              <EmptyState
                title="Ще немає товарів"
                hint="Додайте перший товар кнопкою «Додати товар»."
              />
            )
          ) : pageLoading ? (
            <TableSkeleton />
          ) : (
            <>
              <p className="mb-2 text-xs tabular-nums text-navy-400" aria-live="polite">
                Знайдено: {total}
              </p>

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
                    {items.map((p) => (
                      <tr key={p.id} className="border-b border-[color:var(--line)] last:border-b-0">
                        <td className="px-4 py-3 font-medium text-navy-900">
                          <span className="inline-flex items-center gap-2">
                            <FeaturedStar
                              active={!!p.isFeatured}
                              busy={busyId === p.id}
                              online={online}
                              onClick={() => toggleFeatured(p)}
                            />
                            {p.name}
                            {p.isActive === false && <HiddenTag />}
                          </span>
                        </td>
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
                {items.map((p) => (
                  <li key={p.id} className="rounded-xl border border-[color:var(--line)] bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-medium text-navy-900">
                          <FeaturedStar
                            active={!!p.isFeatured}
                            busy={busyId === p.id}
                            online={online}
                            onClick={() => toggleFeatured(p)}
                          />
                          {p.name}
                          {p.isActive === false && <HiddenTag />}
                        </div>
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

              <PaginationPanel
                page={page}
                totalPages={totalPages}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                total={total}
                pageSize={pageSize}
                onPage={(p) => router.push(hrefFor({ page: p }))}
                onPageSize={(s) => router.push(hrefFor({ pageSize: s, page: 1 }))}
              />
            </>
          )}
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

/** "Прихований" tag for a soft-deleted (isActive=false) product. */
function HiddenTag() {
  return (
    <span className="rounded-full border border-[color:var(--line-2)] bg-cream px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-navy-400">
      Прихований
    </span>
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

/** Star toggle marking a product as "featured" (sorts first in the catalog). */
function FeaturedStar({
  active,
  busy,
  online,
  onClick,
}: {
  active: boolean;
  busy: boolean;
  online: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || !online}
      aria-pressed={active}
      title={active ? "Обраний — прибрати з обраних" : "Зробити обраним"}
      aria-label={active ? "Прибрати з обраних" : "Зробити обраним"}
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:cursor-not-allowed disabled:opacity-40",
        active ? "text-mint-600 hover:text-mint-700" : "text-navy-300 hover:text-navy-700",
      )}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    </button>
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

// ─── Pagination (mirrors the other admin tables) ─────────────────────────────

function buildPageList(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const keep = [...new Set([1, totalPages, current - 1, current, current + 1])]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of keep) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

function PaginationPanel({
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  total,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
}) {
  const arrow =
    "grid h-9 w-9 place-items-center rounded-full border border-[color:var(--line-2)] bg-white text-navy-700 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[color:var(--line-2)]";
  return (
    <nav
      aria-label="Пагінація товарів"
      className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-between"
    >
      <p className="text-xs tabular-nums text-navy-400">
        {rangeStart}–{rangeEnd} із {total}
      </p>

      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Попередня сторінка" className={arrow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <div className="hidden items-center gap-1.5 sm:flex">
          {buildPageList(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} aria-hidden="true" className="px-1 text-sm text-navy-400">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPage(p)}
                aria-label={`Сторінка ${p}`}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  "h-9 min-w-9 rounded-full px-2 text-sm font-medium tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                  p === page
                    ? "bg-navy-900 text-white"
                    : "border border-[color:var(--line-2)] bg-white text-navy-700 hover:border-navy-900",
                )}
              >
                {p}
              </button>
            ),
          )}
        </div>

        <span className="px-1 text-sm tabular-nums text-navy-700 sm:hidden">
          стор. {page} із {totalPages}
        </span>

        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label="Наступна сторінка" className={arrow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      <label className="flex items-center gap-2 text-xs text-navy-400">
        Рядків на сторінці:
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          aria-label="Кількість рядків на сторінці"
          className="rounded-lg border border-[color:var(--line-2)] bg-white py-1.5 pl-2.5 pr-7 text-xs font-medium text-navy-900 outline-none focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
        >
          {PRODUCT_PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
    </nav>
  );
}
