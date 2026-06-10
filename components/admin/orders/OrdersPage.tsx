"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { displayM } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import { formatUAH } from "@/components/shop/data";
import {
  getAdminOrders,
  updateOrderStatus,
  ORDERS_DEFAULT_PAGE_SIZE,
  ORDERS_PAGE_SIZES,
  type AdminOrder,
  type AdminOrdersQuery,
  type AdminOrderStatus,
} from "@/lib/admin-orders";
import { ShopApiError } from "@/lib/shop-client";
import {
  STATUS_META,
  STATUS_ORDER,
  deliveryLabel,
  formatDateTime,
} from "./data";
import { EmptyState, ErrorBanner, SkeletonList } from "./StatePanels";

/** Search debounce — keeps typing from hammering the API per keystroke. */
const SEARCH_DEBOUNCE_MS = 400;

/**
 * Orders are paginated ON THE SERVER (offset, 25/50/100 per page) with classic
 * numbered pages. page/pageSize live in the URL (?page=2&pageSize=50), so
 * refresh, browser Back and link sharing all restore the exact view. Filters
 * (status, search, date range) are server-side query params and any filter
 * change resets to page 1.
 */
export function OrdersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── URL is the source of truth for pagination ─────────────────────────────
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize = (ORDERS_PAGE_SIZES as readonly number[]).includes(rawSize)
    ? rawSize
    : ORDERS_DEFAULT_PAGE_SIZE;

  /** Defaults are omitted so plain /admin/orders stays clean. */
  const hrefFor = (p: number, size: number) => {
    const qp = new URLSearchParams();
    if (p > 1) qp.set("page", String(p));
    if (size !== ORDERS_DEFAULT_PAGE_SIZE) qp.set("pageSize", String(size));
    const qs = qp.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  };
  const goToPage = (p: number) => router.push(hrefFor(p, pageSize));
  const changePageSize = (size: number) => router.push(hrefFor(1, size));
  /** Filter changes land on page 1 without polluting browser history. */
  const resetToFirstPage = () => {
    if (page !== 1) router.replace(hrefFor(1, pageSize));
  };

  // ── Data + filters ─────────────────────────────────────────────────────────
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [statusFilter, setStatusFilter] = useState<AdminOrderStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filters: AdminOrdersQuery = {
    status: statusFilter === "all" ? null : statusFilter,
    q: debouncedQuery,
    from: dateFrom || null,
    to: dateTo || null,
  };
  // One key per (filters, page, pageSize, reload) combination. Loading state
  // is DERIVED (loadedKey !== requestKey), so back/forward navigation shows
  // the skeleton too and no effect ever calls setState synchronously.
  const requestKey = JSON.stringify({ f: filters, page, pageSize, r: reloadKey });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const req = JSON.parse(requestKey) as {
      f: AdminOrdersQuery;
      page: number;
      pageSize: number;
    };
    getAdminOrders({ ...req.f, page: req.page, pageSize: req.pageSize }, ac.signal)
      .then((data) => {
        // Jumped past the end (stale link / shrunken filter)? Land on the
        // last real page instead of an empty one.
        if (data.total > 0 && req.page > data.totalPages) {
          const qp = new URLSearchParams();
          if (data.totalPages > 1) qp.set("page", String(data.totalPages));
          if (req.pageSize !== ORDERS_DEFAULT_PAGE_SIZE) {
            qp.set("pageSize", String(req.pageSize));
          }
          const qs = qp.toString();
          router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
          return;
        }
        setOrders(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setLoadedKey(requestKey);
      })
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setErrorKey(requestKey);
      });
    return () => ac.abort();
  }, [requestKey, router, pathname]);

  const isError = errorKey === requestKey;
  const isLoading = !isError && loadedKey !== requestKey;
  const reload = () => {
    setErrorKey(null);
    setReloadKey((k) => k + 1);
  };

  // ── Filter handlers (every change → page 1) ───────────────────────────────
  const searchTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    },
    [],
  );
  const onSearchChange = (v: string) => {
    setQuery(v);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      setDebouncedQuery(v);
      resetToFirstPage();
    }, SEARCH_DEBOUNCE_MS);
  };
  const pickStatus = (s: AdminOrderStatus | "all") => {
    if (s === statusFilter) return;
    setStatusFilter(s);
    resetToFirstPage();
  };
  const pickDateFrom = (v: string) => {
    setDateFrom(v);
    resetToFirstPage();
  };
  const pickDateTo = (v: string) => {
    setDateTo(v);
    resetToFirstPage();
  };
  const hasActiveFilters =
    statusFilter !== "all" || debouncedQuery.trim() !== "" || !!dateFrom || !!dateTo;
  const resetFilters = () => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    setStatusFilter("all");
    setQuery("");
    setDebouncedQuery("");
    setDateFrom("");
    setDateTo("");
    resetToFirstPage();
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const changeStatus = async (id: string, status: AdminOrderStatus) => {
    setBusyId(id);
    setActionError(null);
    try {
      const updated = await updateOrderStatus(id, status);
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (err) {
      setActionError(
        err instanceof ShopApiError
          ? err.message
          : "Не вдалося оновити статус.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <Container className="py-10 sm:py-14">
      {/* Header */}
      <div className="mb-6">
        <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-mint-100 px-3 py-1 text-xs font-medium text-mint-600">
          Адмін · Магазин
        </span>
        <h1 className={cn(displayM, "text-navy-900")}>
          Замовлення <em className="italic text-mint-600">магазину</em>
        </h1>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-[1.55] text-navy-400">
          Перегляд і керування замовленнями магазину.
        </p>
      </div>

      {/* Toolbar: search + date range + status filter */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-[360px]">
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
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Пошук за імʼям, телефоном або №"
              aria-label="Пошук замовлень"
              className="w-full rounded-full border border-[color:var(--line-2)] bg-white py-2.5 pl-10 pr-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-navy-400">
              Від
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => pickDateFrom(e.target.value)}
                aria-label="Дата від"
                className="rounded-lg border border-[color:var(--line-2)] bg-white px-2.5 py-2 text-sm text-navy-900 outline-none transition-[border,box-shadow] focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-navy-400">
              До
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => pickDateTo(e.target.value)}
                aria-label="Дата до"
                className="rounded-lg border border-[color:var(--line-2)] bg-white px-2.5 py-2 text-sm text-navy-900 outline-none transition-[border,box-shadow] focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
              />
            </label>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-full border border-[color:var(--line-2)] bg-white px-3.5 py-2 text-xs font-medium text-navy-700 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
              >
                Скинути фільтри
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Фільтр за статусом" className="flex flex-wrap gap-2">
            <FilterChip
              active={statusFilter === "all"}
              onClick={() => pickStatus("all")}
              label="Усі"
            />
            {STATUS_ORDER.map((s) => (
              <FilterChip
                key={s}
                active={statusFilter === s}
                onClick={() => pickStatus(s)}
                label={STATUS_META[s].label}
              />
            ))}
          </div>
          {!isLoading && !isError && (
            <p className="text-xs tabular-nums text-navy-400" aria-live="polite">
              Знайдено: {total}
            </p>
          )}
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <SkeletonList rows={Math.min(pageSize, 8)} />
      ) : isError ? (
        <ErrorBanner onRetry={reload} />
      ) : orders.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            title="Нічого не знайдено за фільтрами"
            hint="Жодне замовлення не відповідає пошуку, статусу чи періоду. Змініть умови або скиньте фільтри."
          />
        ) : (
          <EmptyState hint="Замовлення зʼявляться тут, щойно покупці оформлять їх у магазині." />
        )
      ) : (
        <>
          <DesktopTable
            orders={orders}
            expanded={expanded}
            busyId={busyId}
            onToggle={toggle}
            onStatus={changeStatus}
          />
          <MobileCards
            orders={orders}
            expanded={expanded}
            busyId={busyId}
            onToggle={toggle}
            onStatus={changeStatus}
          />

          <PaginationPanel
            page={page}
            totalPages={totalPages}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            total={total}
            pageSize={pageSize}
            onPage={goToPage}
            onPageSize={changePageSize}
          />
        </>
      )}
    </Container>
  );
}

// ─── Pagination ──────────────────────────────────────────────────────────────

/** "1 … 4 5 6 … 20" — first/last always, a window around the current page,
 *  ellipsis for the gaps. ≤7 pages → all numbers, no ellipsis. */
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
      aria-label="Пагінація замовлень"
      className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-between"
    >
      <p className="text-xs tabular-nums text-navy-400">
        {rangeStart}–{rangeEnd} із {total}
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Попередня сторінка"
          className={arrow}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        {/* Numbered pages — desktop/tablet only. */}
        <div className="hidden items-center gap-1.5 sm:flex">
          {buildPageList(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span
                key={`e${i}`}
                aria-hidden="true"
                className="px-1 text-sm text-navy-400"
              >
                …
              </span>
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

        {/* Compact mobile indicator. */}
        <span className="px-1 text-sm tabular-nums text-navy-700 sm:hidden">
          стор. {page} із {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          aria-label="Наступна сторінка"
          className={arrow}
        >
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
          className="rounded-lg border border-[color:var(--line-2)] bg-white py-1.5 pl-2.5 pr-7 text-xs font-medium text-navy-900 outline-none transition-[border,box-shadow] focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
        >
          {ORDERS_PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
}

// ─── Toolbar bits ────────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
        active
          ? "border-navy-900 bg-navy-900 text-white"
          : "border-[color:var(--line-2)] bg-white text-navy-700 hover:border-navy-900",
      )}
    >
      {label}
    </button>
  );
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

/** Thin status-coloured strip pinned to the left edge of a row/card. */
function StatusBar({ status }: { status: AdminOrderStatus }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute inset-y-0 left-0 w-[3px]",
        STATUS_META[status].bar,
      )}
    />
  );
}

/**
 * The single status carrier in a row/card: its visible TEXT value names the
 * status (a11y — not colour-only), the tinted border/background echoes it.
 */
function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: AdminOrderStatus;
  onChange: (s: AdminOrderStatus) => void;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center">
      <span className="sr-only">Статус замовлення (змінюється вибором)</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as AdminOrderStatus)}
        aria-label="Статус замовлення"
        className={cn(
          "rounded-lg border py-1.5 pl-2.5 pr-7 text-xs font-medium outline-none transition-[border,box-shadow,background,color] focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)] disabled:opacity-50",
          STATUS_META[value].select,
        )}
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
    </label>
  );
}

function OrderDetails({ order }: { order: AdminOrder }) {
  return (
    <div className="rounded-lg border border-[color:var(--line)] bg-cream/40 p-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.06em] text-navy-400">
        Склад замовлення
      </h3>
      <ul className="flex flex-col divide-y divide-[color:var(--line)]">
        {order.items.map((it, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate text-navy-700">
              {it.name}{" "}
              <span className="text-navy-400">
                × {it.quantity} · {formatUAH(it.price)}
              </span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-navy-900">
              {formatUAH(it.price * it.quantity)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-sm">
        <span className="text-navy-400">Разом</span>
        <span className="text-base font-medium tabular-nums text-navy-900">
          {formatUAH(order.total)}
        </span>
      </div>
      <p className="mt-2 text-xs text-navy-400">{deliveryLabel(order)}</p>
    </div>
  );
}

function ExpandToggle({
  expanded,
  onClick,
  controls,
  label,
}: {
  expanded: boolean;
  onClick: () => void;
  controls: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={expanded ? `Згорнути ${label}` : `Розгорнути ${label}`}
      className="grid h-8 w-8 place-items-center rounded-full text-navy-700 transition-colors hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={cn("transition-transform", expanded && "rotate-180")}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

interface ListProps {
  orders: AdminOrder[];
  expanded: Set<string>;
  busyId: string | null;
  onToggle: (id: string) => void;
  onStatus: (id: string, s: AdminOrderStatus) => void;
}

// ─── Desktop table ───────────────────────────────────────────────────────────

function DesktopTable({ orders, expanded, busyId, onToggle, onStatus }: ListProps) {
  return (
    <div className="hidden overflow-hidden rounded-xl border border-[color:var(--line)] bg-white md:block">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[color:var(--line)] bg-cream/60 text-left text-xs font-medium uppercase tracking-[0.04em] text-navy-400">
            <th scope="col" className="w-10 px-2 py-3" />
            <th scope="col" className="px-3 py-3">№</th>
            <th scope="col" className="px-3 py-3">Дата</th>
            <th scope="col" className="px-3 py-3">Покупець</th>
            <th scope="col" className="px-3 py-3">Доставка</th>
            <th scope="col" className="px-3 py-3 text-right">Сума</th>
            <th scope="col" className="px-3 py-3">Статус</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const isOpen = expanded.has(o.id);
            const panelId = `order-${o.id}-details`;
            return (
              <Fragment key={o.id}>
                {/* Whole-row tint per status; hover is a darker step of the
                    SAME hue so rows stay calm and readable. */}
                <tr
                  className={cn(
                    "border-b border-[color:var(--line)] align-top transition-colors last:border-b-0",
                    STATUS_META[o.status].row,
                  )}
                >
                  <td className="relative px-2 py-3">
                    <StatusBar status={o.status} />
                    <ExpandToggle
                      expanded={isOpen}
                      onClick={() => onToggle(o.id)}
                      controls={panelId}
                      label={`замовлення ${o.number}`}
                    />
                  </td>
                  <td className="px-3 py-3 font-medium text-navy-900">{o.number}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-navy-700">
                    {formatDateTime(o.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-navy-900">{o.contactName}</div>
                    <div className="text-xs tabular-nums text-navy-400">
                      {o.contactPhone}
                    </div>
                  </td>
                  <td className="max-w-[220px] px-3 py-3 text-navy-700">
                    <span className="line-clamp-2">{deliveryLabel(o)}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums text-navy-900">
                    {formatUAH(o.total)}
                  </td>
                  <td className="px-3 py-3">
                    <StatusSelect
                      value={o.status}
                      disabled={busyId === o.id}
                      onChange={(s) => onStatus(o.id, s)}
                    />
                  </td>
                </tr>
                {isOpen && (
                  <tr
                    className={cn(
                      "border-b border-[color:var(--line)] last:border-b-0",
                      STATUS_META[o.status].row,
                    )}
                  >
                    <td colSpan={7} className="px-3 pb-4 pt-0">
                      <div id={panelId}>
                        <OrderDetails order={o} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Mobile cards ────────────────────────────────────────────────────────────

function MobileCards({ orders, expanded, busyId, onToggle, onStatus }: ListProps) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {orders.map((o) => {
        const isOpen = expanded.has(o.id);
        const panelId = `order-m-${o.id}-details`;
        return (
          <li
            key={o.id}
            className={cn(
              "relative overflow-hidden rounded-xl border border-[color:var(--line)] p-4 transition-colors",
              STATUS_META[o.status].row,
            )}
          >
            <StatusBar status={o.status} />
            <div>
              <div className="font-medium text-navy-900">{o.number}</div>
              <div className="text-xs text-navy-400">
                {formatDateTime(o.createdAt)}
              </div>
            </div>

            <div className="mt-3 text-sm">
              <div className="font-medium text-navy-900">{o.contactName}</div>
              <div className="text-xs tabular-nums text-navy-400">
                {o.contactPhone}
              </div>
              <div className="mt-1 text-navy-700">{deliveryLabel(o)}</div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-base font-medium tabular-nums text-navy-900">
                {formatUAH(o.total)}
              </span>
              <ExpandToggle
                expanded={isOpen}
                onClick={() => onToggle(o.id)}
                controls={panelId}
                label={`замовлення ${o.number}`}
              />
            </div>

            {isOpen && (
              <div id={panelId} className="mt-3">
                <OrderDetails order={o} />
              </div>
            )}

            <div className="mt-3 flex items-center gap-2 border-t border-[color:var(--line)] pt-3">
              <span className="text-xs text-navy-400">Статус:</span>
              <StatusSelect
                value={o.status}
                disabled={busyId === o.id}
                onChange={(s) => onStatus(o.id, s)}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
