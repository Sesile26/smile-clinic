"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { displayM } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useCart } from "@/components/shop/CartContext";
import { formatUAH } from "@/components/shop/data";
import { formatDate } from "@/components/my/appointments/data";
import { ErrorBanner, OfflineNotice } from "@/components/my/appointments/StatePanels";
import {
  getMyOrders,
  itemToProduct,
  ORDERS_PAGE_SIZE,
  type MyOrder,
  type MyOrderItem,
  type MyOrdersPage as MyOrdersPageData,
} from "@/lib/my-orders";
import { DELIVERY_LABEL, STATUS_META } from "./data";

export function MyOrdersPage() {
  // Reads ?page → wrap in Suspense.
  return (
    <Suspense fallback={<Container className="py-10 sm:py-14"><OrdersSkeleton /></Container>}>
      <MyOrdersInner />
    </Suspense>
  );
}

function MyOrdersInner() {
  const { isOnline } = useOnlineStatus();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const [data, setData] = useState<MyOrdersPageData | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const requestKey = `${page}|${ORDERS_PAGE_SIZE}`;

  useEffect(() => {
    // Offline → no fetch (orders aren't mirrored); keep any already-loaded page.
    if (!isOnline || loadedKey === requestKey) return;
    const ac = new AbortController();
    getMyOrders(page, ORDERS_PAGE_SIZE, ac.signal)
      .then((d) => {
        setData(d);
        setLoadedKey(requestKey);
      })
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setErrorKey(requestKey);
      });
    return () => ac.abort();
  }, [isOnline, requestKey, page, loadedKey]);

  const reload = () => {
    setErrorKey(null);
    setLoadedKey(null);
  };

  const hrefFor = (p: number) => (p <= 1 ? pathname : `${pathname}?page=${p}`);

  // Clamp an out-of-range ?page to the last page.
  useEffect(() => {
    if (data && data.total > 0 && page > data.totalPages) {
      router.replace(hrefFor(data.totalPages));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, page]);

  const isError = errorKey === requestKey;
  const firstLoading = isOnline && data === null && !isError;
  const pageLoading = isOnline && data !== null && loadedKey !== requestKey && !isError;

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * ORDERS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * ORDERS_PAGE_SIZE, total);

  return (
    <Container className="py-10 sm:py-14">
      {/* Header */}
      <div className="mb-6">
        <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-mint-100 px-3 py-1 text-xs font-medium text-mint-600">
          Мій профіль
        </span>
        <h1 className={cn(displayM, "text-navy-900")}>
          Історія <em className="italic text-mint-600">покупок</em>
        </h1>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-[1.55] text-navy-400">
          Ваші замовлення в магазині клініки. Будь-який товар можна замовити повторно.
        </p>
      </div>

      {!isOnline && <OfflineNotice className="mb-6" />}

      {!isOnline && data === null ? (
        <OfflineUnavailable />
      ) : firstLoading || pageLoading ? (
        <OrdersSkeleton />
      ) : isError && data === null ? (
        <ErrorBanner onRetry={reload} />
      ) : total === 0 ? (
        <EmptyOrders />
      ) : (
        <>
          <div className="flex flex-col gap-5">
            {data!.items.map((o) => (
              <OrderCard key={o.id} order={o} online={isOnline} />
            ))}
          </div>
          <PaginationPanel
            page={page}
            totalPages={totalPages}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            total={total}
            hrefFor={hrefFor}
            onNavigate={(p) => router.push(hrefFor(p))}
          />
        </>
      )}
    </Container>
  );
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({ order, online }: { order: MyOrder; online: boolean }) {
  const meta = STATUS_META[order.status];
  return (
    <article className="overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white">
      {/* Card header */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[color:var(--line)] bg-cream/40 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium tabular-nums text-navy-900">№ {order.id}</span>
          <span className="text-sm text-navy-400">{formatDate(order.date)}</span>
          <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", meta.badge)}>
            {meta.label}
          </span>
          <span className="text-xs text-navy-400">· {DELIVERY_LABEL[order.deliveryMethod]}</span>
        </div>
        <span className="text-base font-medium tabular-nums text-navy-900">
          {formatUAH(order.total)}
        </span>
      </div>

      {/* Items */}
      <ul className="divide-y divide-[color:var(--line)]">
        {order.items.map((it, i) => (
          <li key={`${order.id}-${i}`}>
            <OrderItemRow item={it} online={online} />
          </li>
        ))}
      </ul>
    </article>
  );
}

function OrderItemRow({ item, online }: { item: MyOrderItem; online: boolean }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  const removed = item.availability === "removed" || !item.productId;
  const outOfStock = item.availability === "out_of_stock";
  const lineTotal = item.priceAtPurchase * item.quantity;

  const onAdd = () => {
    if (removed || outOfStock || !online) return;
    add(itemToProduct(item));
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <Thumb src={item.imageUrl} alt={item.name} dimmed={removed || outOfStock} />

      <div className="min-w-0 flex-1">
        {removed ? (
          <span className="block truncate text-sm font-medium text-navy-400">{item.name}</span>
        ) : (
          <Link
            href={`/shop/${item.productId}`}
            className="block truncate text-sm font-medium text-navy-900 underline-offset-2 transition-colors hover:text-mint-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:rounded"
          >
            {item.name}
          </Link>
        )}
        <div className="mt-0.5 text-xs tabular-nums text-navy-400">
          {item.quantity} × {formatUAH(item.priceAtPurchase)} = {formatUAH(lineTotal)}
        </div>
      </div>

      {/* Reorder — three states */}
      <div className="shrink-0">
        {removed ? (
          <span className="text-xs font-medium text-navy-400">Товар недоступний</span>
        ) : outOfStock ? (
          <button
            type="button"
            disabled
            aria-label={`«${item.name}» немає в наявності`}
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-[color:var(--line-2)] px-3 py-1.5 text-xs font-medium text-navy-400 opacity-70"
          >
            Немає в наявності
          </button>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            disabled={!online}
            aria-label={`Додати «${item.name}» в кошик`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
              added ? "bg-mint text-navy-900" : "bg-navy-900 text-white hover:bg-black",
            )}
          >
            {added ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                Додано
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                Додати
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function Thumb({ src, alt, dimmed }: { src: string | null; alt: string; dimmed?: boolean }) {
  const [broken, setBroken] = useState(false);
  const show = !!src && !broken;
  return (
    <div className={cn("relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-[color:var(--line)] bg-[linear-gradient(150deg,#0F1E36,#0A1628)] text-mint", dimmed && "opacity-50")}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src!} alt={alt} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 9l9-6 9 6v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
      )}
    </div>
  );
}

// ─── States ───────────────────────────────────────────────────────────────────

function EmptyOrders() {
  return (
    <div className="rounded-2xl border border-dashed border-[color:var(--line-2)] bg-white px-6 py-14 text-center">
      <h2 className="font-serif text-xl text-navy-900">Ви ще нічого не замовляли</h2>
      <p className="mx-auto mt-1.5 max-w-[40ch] text-sm text-navy-400">
        Перегляньте каталог — рекомендовані засоби догляду з доставкою чи самовивозом.
      </p>
      <Link
        href="/shop"
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-navy-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
      >
        До магазину
      </Link>
    </div>
  );
}

function OfflineUnavailable() {
  return (
    <div className="rounded-2xl border border-dashed border-[color:var(--line-2)] bg-white px-6 py-14 text-center">
      <h2 className="font-serif text-xl text-navy-900">Історія недоступна офлайн</h2>
      <p className="mx-auto mt-1.5 max-w-[40ch] text-sm text-navy-400">
        Підключіться до інтернету, щоб переглянути свої замовлення.
      </p>
    </div>
  );
}

function OrdersSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-5">
      <span className="sr-only">Завантаження історії покупок…</span>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white">
          <div className="flex items-center justify-between border-b border-[color:var(--line)] bg-cream/40 px-5 py-3">
            <div className="h-4 w-40 animate-pulse rounded bg-bone/60" />
            <div className="h-4 w-20 animate-pulse rounded bg-bone/50" />
          </div>
          <div className="flex items-center gap-3 px-5 py-3">
            <div className="h-14 w-14 animate-pulse rounded-lg bg-bone/50" />
            <div className="flex-1">
              <div className="h-4 w-1/2 animate-pulse rounded bg-bone/60" />
              <div className="mt-2 h-3 w-24 animate-pulse rounded bg-bone/40" />
            </div>
            <div className="h-7 w-20 animate-pulse rounded-full bg-bone/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Numbered pagination (matches the rest of the app) ────────────────────────

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

function PaginationPanel({
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  total,
  hrefFor,
  onNavigate,
}: {
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  hrefFor: (p: number) => string;
  onNavigate: (p: number) => void;
}) {
  const arrow =
    "grid h-9 w-9 place-items-center rounded-full border border-[color:var(--line-2)] bg-white text-navy-700 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[color:var(--line-2)]";
  return (
    <nav aria-label="Пагінація історії покупок" className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-xs tabular-nums text-navy-400">{rangeStart}–{rangeEnd} із {total}</p>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onNavigate(page - 1)} disabled={page <= 1} aria-label="Попередня сторінка" className={arrow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div className="hidden items-center gap-1.5 sm:flex">
          {buildPageList(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} aria-hidden="true" className="px-1 text-sm text-navy-400">…</span>
            ) : (
              <a
                key={p}
                href={hrefFor(p)}
                onClick={(e) => { e.preventDefault(); onNavigate(p); }}
                aria-label={`Сторінка ${p}`}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  "grid h-9 min-w-9 place-items-center rounded-full px-2 text-sm font-medium tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                  p === page ? "bg-navy-900 text-white" : "border border-[color:var(--line-2)] bg-white text-navy-700 hover:border-navy-900",
                )}
              >
                {p}
              </a>
            ),
          )}
        </div>
        <span className="px-1 text-sm tabular-nums text-navy-700 sm:hidden">стор. {page} із {totalPages}</span>
        <button type="button" onClick={() => onNavigate(page + 1)} disabled={page >= totalPages} aria-label="Наступна сторінка" className={arrow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>
    </nav>
  );
}
