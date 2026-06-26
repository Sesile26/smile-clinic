"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { ShopApiError } from "@/lib/shop-client";
import {
  getAdminCustomers,
  getCustomerHistory,
  CUSTOMERS_DEFAULT_PAGE_SIZE,
  CUSTOMERS_PAGE_SIZES,
  type AdminCustomerRow,
  type AdminCustomersPage,
  type CustomerHistory,
  type CustomerOrder,
} from "@/lib/admin-customers";
import { formatUAH } from "@/components/shop/data";
import { formatDate } from "@/components/admin/patients/data";
import { STATUS_META, DELIVERY_LABEL } from "@/components/my/orders/data";
import {
  SkeletonList,
  EmptyState,
  ErrorBanner,
} from "@/components/admin/patients/StatePanels";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Shop customers (MOCK) + per-customer purchase history. Mirrors
 * /admin/patients: list state (q/page/pageSize) and the open customer
 * (?customer=<id>) live in the URL, so reload / back / deep-links work. The
 * order-history view reuses the /my/orders order-card structure (header +
 * items), minus the buyer-only "reorder" button.
 */
export function CustomersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize = (CUSTOMERS_PAGE_SIZES as readonly number[]).includes(rawSize)
    ? rawSize
    : CUSTOMERS_DEFAULT_PAGE_SIZE;
  const urlQ = searchParams.get("q") ?? "";

  const hrefFor = (next: { page?: number; pageSize?: number; q?: string }) => {
    const p = next.page ?? page;
    const ps = next.pageSize ?? pageSize;
    const qq = (next.q ?? urlQ).trim();
    const sp = new URLSearchParams();
    if (qq) sp.set("q", qq);
    if (p > 1) sp.set("page", String(p));
    if (ps !== CUSTOMERS_DEFAULT_PAGE_SIZE) sp.set("pageSize", String(ps));
    const s = sp.toString();
    return `${pathname}${s ? `?${s}` : ""}`;
  };

  // The open customer is URL-driven (?customer=<id>) — not local state.
  const selectedId = searchParams.get("customer");
  const customerHref = (id: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("customer", id);
    return `${pathname}?${sp.toString()}`;
  };
  const listHref = () => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("customer");
    const s = sp.toString();
    return `${pathname}${s ? `?${s}` : ""}`;
  };

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

  const [data, setData] = useState<AdminCustomersPage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = JSON.stringify({ q: urlQ, page, pageSize, reloadKey });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    getAdminCustomers({ q: urlQ, page, pageSize }, ac.signal)
      .then((d) => {
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
  }, [requestKey]);

  const isError = errorKey === requestKey;
  const isLoading = !isError && loadedKey !== requestKey;
  const reload = () => {
    setErrorKey(null);
    setReloadKey((k) => k + 1);
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const hasSearch = urlQ.trim() !== "";

  if (selectedId) {
    return (
      <CustomerDetail key={selectedId} customerId={selectedId} backHref={listHref()} />
    );
  }

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
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
            placeholder="Пошук за імʼям, email або телефоном"
            aria-label="Пошук покупців"
            className="w-full rounded-full border border-[color:var(--line-2)] bg-white py-2.5 pl-10 pr-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
          />
        </div>
        <RefreshButton onClick={reload} busy={isLoading} className="ml-auto" />
      </div>

      {isLoading ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorBanner onRetry={reload} />
      ) : items.length === 0 ? (
        hasSearch ? (
          <EmptyState icon="search" title="Нічого не знайдено" hint="Жоден покупець не відповідає пошуку. Змініть запит." />
        ) : (
          <EmptyState title="Ще немає покупців" hint="Покупці зʼявляться тут після перших замовлень у магазині." />
        )
      ) : (
        <>
          <p className="mb-2 text-xs tabular-nums text-navy-400" aria-live="polite">
            Знайдено: {total}
          </p>
          <CustomersTable customers={items} onOpen={(id) => router.push(customerHref(id))} />
          <CustomersCards customers={items} onOpen={(id) => router.push(customerHref(id))} />
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
  );
}

// ─── List: desktop table ──────────────────────────────────────────────────────

interface ListProps {
  customers: AdminCustomerRow[];
  onOpen: (id: string) => void;
}

function CustomersTable({ customers, onOpen }: ListProps) {
  return (
    <div className="hidden overflow-hidden rounded-xl border border-[color:var(--line)] bg-white md:block">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[color:var(--line)] bg-cream/60 text-left text-xs font-medium uppercase tracking-[0.04em] text-navy-400">
            <th scope="col" className="px-4 py-3">Покупець</th>
            <th scope="col" className="px-3 py-3">Email</th>
            <th scope="col" className="px-3 py-3">Телефон</th>
            <th scope="col" className="px-3 py-3 text-center">Замовлень</th>
            <th scope="col" className="px-3 py-3 text-right">Сума</th>
            <th scope="col" className="px-3 py-3">Останнє замовлення</th>
            <th scope="col" className="w-10 px-2 py-3" />
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} className="border-b border-[color:var(--line)] transition-colors last:border-b-0 hover:bg-cream/40">
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onOpen(c.id)}
                  className="text-left font-medium text-navy-900 underline-offset-2 hover:text-mint-600 hover:underline focus:rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
                >
                  {c.name}
                </button>
              </td>
              <td className="px-3 py-3 text-navy-400">{c.email}</td>
              <td className="whitespace-nowrap px-3 py-3 tabular-nums text-navy-700">{c.phone ?? "—"}</td>
              <td className="px-3 py-3 text-center tabular-nums text-navy-700">{c.orderCount}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-navy-900">{formatUAH(c.totalSpent)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-navy-700">{c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"}</td>
              <td className="px-2 py-3">
                <button
                  type="button"
                  onClick={() => onOpen(c.id)}
                  aria-label={`Відкрити покупки: ${c.name}`}
                  className="grid h-8 w-8 place-items-center rounded-full text-navy-400 transition-colors hover:bg-cream hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── List: mobile cards ───────────────────────────────────────────────────────

function CustomersCards({ customers, onOpen }: ListProps) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {customers.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onOpen(c.id)}
            className="w-full rounded-xl border border-[color:var(--line)] bg-white p-4 text-left transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium text-navy-900">{c.name}</span>
              <span className="shrink-0 font-medium tabular-nums text-navy-900">{formatUAH(c.totalSpent)}</span>
            </div>
            <div className="mt-1 text-xs text-navy-400">{c.email}</div>
            <div className="text-xs tabular-nums text-navy-400">{c.phone ?? "—"}</div>
            <div className="mt-2 flex items-center justify-between text-xs text-navy-700">
              <span>Замовлень: <span className="font-medium tabular-nums">{c.orderCount}</span></span>
              <span>{c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"}</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── Detail: one customer's purchase history ──────────────────────────────────

function CustomerDetail({ customerId, backHref }: { customerId: string; backHref: string }) {
  // Single fetch: customer summary + one page of orders (keyed by id+page).
  const [data, setData] = useState<CustomerHistory | null>(null);
  const [ordersPage, setOrdersPage] = useState(1);
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const requestKey = `${customerId}|${ordersPage}|${reloadKey}`;

  useEffect(() => {
    const ac = new AbortController();
    getCustomerHistory(customerId, ordersPage, ac.signal)
      .then((h) => {
        setData(h);
        setLoadedPage(ordersPage);
        setState("ready");
      })
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        const status = err instanceof ShopApiError ? err.status : 0;
        setState(status === 404 ? "denied" : "error");
      });
    return () => ac.abort();
  }, [customerId, ordersPage, reloadKey, requestKey]);

  const reload = () => {
    setState("loading");
    setReloadKey((k) => k + 1);
  };
  // New page in flight (skeleton the orders, keep the header).
  const pageLoading = data !== null && loadedPage !== ordersPage && state === "ready";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line-2)] bg-white px-3.5 py-2 text-sm font-medium text-navy-700 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          До списку
        </Link>
        <RefreshButton onClick={reload} busy={state === "loading"} />
      </div>

      {!data ? (
        state === "denied" ? (
          <EmptyState title="Покупця не знайдено" hint="Покупець не існує або не має замовлень." />
        ) : state === "error" ? (
          <ErrorBanner onRetry={reload} />
        ) : (
          <SkeletonList rows={5} />
        )
      ) : (
        <>
          <div className="mb-5 rounded-xl border border-[color:var(--line)] bg-white p-5">
            <h2 className="font-serif text-[24px] leading-tight tracking-[-0.01em] text-navy-900">{data.customer.name}</h2>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-navy-400">
              <span>{data.customer.email}</span>
              <span className="tabular-nums">{data.customer.phone ?? "—"}</span>
              <span>Замовлень: {data.customer.orderCount}</span>
              <span>Сума: <span className="font-medium text-navy-700">{formatUAH(data.customer.totalSpent)}</span></span>
            </div>
          </div>

          <SectionHeading title="Історія покупок" count={data.orders.total} />
          {state === "error" ? (
            <ErrorBanner onRetry={reload} />
          ) : pageLoading ? (
            <SkeletonList rows={3} />
          ) : data.orders.total === 0 ? (
            <EmptyState title="Немає замовлень" hint="У цього покупця поки немає замовлень." />
          ) : (
            <div className="flex flex-col gap-4">
              {data.orders.items.map((o) => (
                <OrderCard key={o.id} order={o} />
              ))}
              <HistoryPagination
                page={data.orders.page}
                totalPages={data.orders.totalPages}
                total={data.orders.total}
                pageSize={data.orders.pageSize}
                onPage={setOrdersPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.06em] text-navy-400">
      {title} · {count}
    </h3>
  );
}

// ─── Order card (reused structure from /my/orders, read-only — no reorder) ────

function OrderCard({ order }: { order: CustomerOrder }) {
  const meta = STATUS_META[order.status];
  return (
    <article className="overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[color:var(--line)] bg-cream/40 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium tabular-nums text-navy-900">№ {order.id}</span>
          <span className="text-sm text-navy-400">{formatDate(order.date)}</span>
          <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", meta.badge)}>{meta.label}</span>
          <span className="text-xs text-navy-400">· {DELIVERY_LABEL[order.deliveryMethod]}</span>
        </div>
        <span className="text-base font-medium tabular-nums text-navy-900">{formatUAH(order.total)}</span>
      </div>
      <ul className="divide-y divide-[color:var(--line)]">
        {order.items.map((it, i) => (
          <li key={`${order.id}-${i}`} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <Thumb src={it.imageUrl} alt={it.name} />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-navy-900">{it.name}</span>
              <div className="mt-0.5 text-xs tabular-nums text-navy-400">
                {it.quantity} × {formatUAH(it.priceAtPurchase)} = {formatUAH(it.priceAtPurchase * it.quantity)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  const show = !!src && !broken;
  return (
    <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-[color:var(--line)] bg-[linear-gradient(150deg,#0F1E36,#0A1628)] text-mint">
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src!} alt={alt} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 9l9-6 9 6v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
      )}
    </div>
  );
}

// ─── Pagination (list: with page-size; history: numbers only) ─────────────────

function buildPageList(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
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

const arrowCls =
  "grid h-9 w-9 place-items-center rounded-full border border-[color:var(--line-2)] bg-white text-navy-700 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[color:var(--line-2)]";
const numCls = (active: boolean) =>
  cn(
    "h-9 min-w-9 rounded-full px-2 text-sm font-medium tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
    active ? "bg-navy-900 text-white" : "border border-[color:var(--line-2)] bg-white text-navy-700 hover:border-navy-900",
  );

function PageNumbers({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Попередня сторінка" className={arrowCls}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <div className="hidden items-center gap-1.5 sm:flex">
        {buildPageList(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} aria-hidden="true" className="px-1 text-sm text-navy-400">…</span>
          ) : (
            <button key={p} type="button" onClick={() => onPage(p)} aria-label={`Сторінка ${p}`} aria-current={p === page ? "page" : undefined} className={numCls(p === page)}>
              {p}
            </button>
          ),
        )}
      </div>
      <span className="px-1 text-sm tabular-nums text-navy-700 sm:hidden">стор. {page} із {totalPages}</span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label="Наступна сторінка" className={arrowCls}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6 6-6" /></svg>
      </button>
    </div>
  );
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
  return (
    <nav aria-label="Пагінація покупців" className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-xs tabular-nums text-navy-400">{rangeStart}–{rangeEnd} із {total}</p>
      <PageNumbers page={page} totalPages={totalPages} onPage={onPage} />
      <label className="flex items-center gap-2 text-xs text-navy-400">
        Рядків на сторінці:
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          aria-label="Кількість рядків на сторінці"
          className="rounded-lg border border-[color:var(--line-2)] bg-white py-1.5 pl-2.5 pr-7 text-xs font-medium text-navy-900 outline-none focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
        >
          {CUSTOMERS_PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
    </nav>
  );
}

function HistoryPagination({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Пагінація замовлень" className="mt-1 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-xs tabular-nums text-navy-400">{rangeStart}–{rangeEnd} із {total}</p>
      <PageNumbers page={page} totalPages={totalPages} onPage={onPage} />
    </nav>
  );
}
