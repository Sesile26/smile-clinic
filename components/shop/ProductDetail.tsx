"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Container } from "@/components/ui/Container";
import { IcoChild, IcoShield, IcoSparkle, IcoTooth } from "@/components/icons";
import { useShopRole, isShopManager } from "@/hooks/useShop";
import { getProduct } from "@/lib/shop-client";
import { slugify } from "@/lib/slug";
import { db } from "@/lib/db";
import type { ApiProduct, ApiProductDetail } from "@/lib/shop-types";
import { useCart } from "./CartContext";
import { ProductCard } from "./ProductCard";
import { OfflineNotice } from "./StatePanels";
import { formatUAH } from "./data";

const QTY_MAX = 10; // UI cap; the server enforces real stock at checkout.

function CategoryGlyph({ category, size }: { category: string | null; size: number }) {
  switch (category) {
    case "Відбілювання":
      return <IcoSparkle size={size} />;
    case "Дитяча гігієна":
      return <IcoChild size={size} />;
    case "Аксесуари":
      return <IcoShield size={size} />;
    default:
      return <IcoTooth size={size} />;
  }
}

/** Offline fallback: build a detail shape from the Dexie catalog mirror (which
 *  holds card fields only — no rich text / gallery / similar). */
function mirrorToDetail(id: string): Promise<ApiProductDetail | null> {
  return db.products.get(id).then((m) =>
    m
      ? {
          id: m.id,
          name: m.name,
          description: m.description,
          price: m.price,
          imageUrl: m.imageUrl,
          categoryId: m.categoryId,
          categoryName: m.categoryName,
          inStock: m.inStock,
          isActive: m.isActive,
          longDescription: null,
          categorySlug: m.categoryName ? slugify(m.categoryName) : null,
          images: m.imageUrl ? [m.imageUrl] : [],
          similar: [],
        }
      : null,
  );
}

export function ProductDetail({ id }: { id: string }) {
  const { isOnline: online } = useOnlineStatus();
  const { role } = useShopRole();
  const canManage = isShopManager(role);
  const { add, setQty, items } = useCart();

  // Result tagged with the id it was fetched for → loading is DERIVED
  // (data.id !== id), so there's no synchronous setState in the effect.
  const [data, setData] = useState<{ id: string; product: ApiProductDetail | null } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      let product: ApiProductDetail | null = null;
      if (online) {
        try {
          product = await getProduct(id);
        } catch {
          product = await mirrorToDetail(id); // network blip → try the mirror
        }
      } else {
        product = await mirrorToDetail(id);
      }
      if (active) setData({ id, product });
    })();
    return () => {
      active = false;
    };
  }, [id, online]);

  const qtyOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.product.id, i.qty);
    return (pid: string) => m.get(pid) ?? 0;
  }, [items]);

  if (!data || data.id !== id) return <DetailSkeleton />; // loading
  if (data.product === null) return <NotFound />;

  return (
    <ProductView
      product={data.product}
      online={online}
      purchasable={!canManage}
      add={add}
      setQty={setQty}
      qtyOf={qtyOf}
    />
  );
}

function ProductView({
  product,
  online,
  purchasable,
  add,
  setQty,
  qtyOf,
}: {
  product: ApiProductDetail;
  online: boolean;
  purchasable: boolean;
  add: (p: ApiProduct) => void;
  setQty: (id: string, qty: number) => void;
  qtyOf: (id: string) => number;
}) {
  const { openCart } = useCart();
  const inCart = qtyOf(product.id);
  const outOfStock = !product.inStock;

  // "Перейти до покупки": open the one global cart, then let <Link> navigate to
  // /shop. Only on a plain click — modified clicks (new tab) just open /shop in
  // the other tab without yanking the cart open here.
  const goToCart = (e: React.MouseEvent) => {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      openCart();
    }
  };

  const gallery = product.images.length > 0
    ? product.images
    : product.imageUrl
      ? [product.imageUrl]
      : [];

  const [qty, setLocalQty] = useState(1);
  const [imgIdx, setImgIdx] = useState(0);
  const [erroredImgs, setErroredImgs] = useState<Set<number>>(new Set());
  const [added, setAdded] = useState(false);

  const mainBroken = gallery.length === 0 || erroredImgs.has(imgIdx) || !online;
  const markErrored = (i: number) => setErroredImgs((s) => new Set(s).add(i));

  const handleAdd = () => {
    if (outOfStock || !online) return;
    add(product);
    if (qty > 1) setQty(product.id, inCart + qty);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2500);
  };

  const catHref = product.categorySlug
    ? `/shop?category=${encodeURIComponent(product.categorySlug)}`
    : "/shop";

  const backLabel = product.categoryName
    ? `Назад до «${product.categoryName}»`
    : "Назад до каталогу";

  return (
    <Container className="py-8 sm:py-12">
      {/* Top row: back (left) + "go to purchase" CTA (right), symmetric. The
          CTA opens the one global cart and navigates to /shop. CTA shows for
          buyers only — managers have no cart. On mobile the CTA collapses to
          its icon and the back label truncates, so the two never collide. */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href={catHref}
          aria-label={backLabel}
          className="-ml-2 inline-flex min-h-[40px] min-w-0 items-center gap-2 rounded-full px-2 py-2 text-sm font-medium text-navy-700 transition-colors hover:text-mint-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
        >
          <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          <span className="truncate">{backLabel}</span>
        </Link>

        {purchasable && (
          <Link
            href="/shop"
            onClick={goToCart}
            aria-label="Перейти до покупки"
            className="inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full bg-navy-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1 sm:px-4"
          >
            <svg className="shrink-0" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
            </svg>
            <span className="hidden sm:inline">Перейти до покупки</span>
          </Link>
        )}
      </div>

      {/* Breadcrumbs */}
      <nav aria-label="Хлібні крихти" className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-navy-400">
        <Link href="/shop" className="transition-colors hover:text-mint-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:rounded">Магазин</Link>
        {product.categoryName && (
          <>
            <Sep />
            <Link href={catHref} className="transition-colors hover:text-mint-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:rounded">{product.categoryName}</Link>
          </>
        )}
        <Sep />
        <span className="truncate text-navy-700" aria-current="page">{product.name}</span>
      </nav>

      {!online && <OfflineNotice className="mb-5" />}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
        {/* ── Gallery (top on mobile, left on desktop) ───────────────────────── */}
        <div>
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[linear-gradient(150deg,#0F1E36_0%,#0A1628_100%)]">
            {!mainBroken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={imgIdx}
                src={gallery[imgIdx]}
                alt={product.name}
                onError={() => markErrored(imgIdx)}
                className={cn("absolute inset-0 h-full w-full object-cover", outOfStock && "opacity-60")}
              />
            ) : (
              <>
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_280px_at_80%_0%,rgba(0,201,167,0.28),transparent_60%)]" />
                <div className={cn("absolute inset-0 grid place-items-center text-mint", outOfStock && "opacity-40")}>
                  <CategoryGlyph category={product.categoryName} size={96} />
                </div>
              </>
            )}
            {outOfStock && (
              <span className="absolute right-3 top-3 rounded-full bg-navy-900/90 px-2.5 py-1 text-[11px] font-medium text-white">
                Немає в наявності
              </span>
            )}
          </div>

          {/* Thumbnails (only when >1 photo) */}
          {gallery.length > 1 && (
            <ul className="mt-3 flex gap-2.5" role="list" aria-label="Фото товару">
              {gallery.map((src, i) => {
                const active = i === imgIdx;
                const broken = erroredImgs.has(i) || !online;
                return (
                  <li key={`${src}-${i}`}>
                    <button
                      type="button"
                      onClick={() => setImgIdx(i)}
                      aria-label={`Фото ${i + 1}`}
                      aria-pressed={active}
                      className={cn(
                        "relative grid h-16 w-16 place-items-center overflow-hidden rounded-lg border bg-[linear-gradient(150deg,#0F1E36,#0A1628)] text-mint transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                        active ? "border-navy-900 ring-2 ring-mint" : "border-[color:var(--line-2)] hover:border-navy-900",
                      )}
                    >
                      {!broken ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt="" onError={() => markErrored(i)} className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <CategoryGlyph category={product.categoryName} size={22} />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Info ───────────────────────────────────────────────────────────── */}
        <div>
          {product.categoryName && (
            <Link href={catHref} className="inline-block rounded-full bg-mint-100 px-3 py-1 text-xs font-medium text-mint-600 transition-colors hover:bg-mint/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint">
              {product.categoryName}
            </Link>
          )}
          <h1 className="mt-3 font-serif text-[30px] leading-tight tracking-[-0.01em] text-navy-900 sm:text-[36px]">
            {product.name}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <span className="text-2xl font-medium tabular-nums text-navy-900">{formatUAH(product.price)}</span>
            <span className={cn("text-sm font-medium", outOfStock ? "text-red-600" : "text-mint-600")}>
              {outOfStock ? "Немає в наявності" : "В наявності"}
            </span>
            {/* Exact stock is sent only to STAFF/ADMIN (gated server-side). */}
            {product.stock !== undefined && (
              <span className="text-xs tabular-nums text-navy-400">Залишок: {product.stock}</span>
            )}
          </div>

          {product.description && (
            <p className="mt-4 max-w-[52ch] text-[15px] leading-[1.6] text-navy-700">{product.description}</p>
          )}

          {/* Buy block — buyers only (STAFF/ADMIN manage in the admin panel). */}
          {purchasable && (
            <div className="mt-6 flex flex-col gap-3 rounded-xl border border-[color:var(--line)] bg-white p-4 sm:flex-row sm:items-center">
              <QtyStepper qty={qty} onChange={setLocalQty} disabled={outOfStock || !online} />
              <button
                type="button"
                onClick={handleAdd}
                disabled={outOfStock || !online}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  "bg-navy-900 text-white hover:bg-black",
                )}
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                {outOfStock ? "Немає в наявності" : inCart > 0 ? `У кошику · ${inCart}` : "Додати в кошик"}
              </button>
            </div>
          )}
          {purchasable && (
            <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-xs font-medium text-mint-600">
              {added ? `Додано в кошик (${qty})` : ""}
            </p>
          )}

          <DetailTabs product={product} />
        </div>
      </div>

      {/* ── Similar products ─────────────────────────────────────────────────── */}
      {product.similar.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-5 font-serif text-2xl text-navy-900">Схожі товари</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {product.similar.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                disabled={!online}
                inCartQty={qtyOf(p.id)}
                onAdd={() => add(p)}
                purchasable={purchasable}
              />
            ))}
          </div>
        </section>
      )}

    </Container>
  );
}

function Sep() {
  return <span aria-hidden="true" className="text-navy-400/50">/</span>;
}

function QtyStepper({
  qty,
  onChange,
  disabled,
}: {
  qty: number;
  onChange: (q: number) => void;
  disabled?: boolean;
}) {
  const btn =
    "grid h-10 w-10 place-items-center rounded-full border border-[color:var(--line-2)] text-navy-900 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Кількість">
      <button type="button" onClick={() => onChange(Math.max(1, qty - 1))} disabled={disabled || qty <= 1} aria-label="Зменшити кількість" className={btn}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
      </button>
      <span className="w-8 text-center text-base font-medium tabular-nums text-navy-900" aria-live="polite">{qty}</span>
      <button type="button" onClick={() => onChange(Math.min(QTY_MAX, qty + 1))} disabled={disabled || qty >= QTY_MAX} aria-label="Збільшити кількість" className={btn}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  );
}

const TABS = [
  { key: "desc", label: "Опис" },
  { key: "specs", label: "Характеристики" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function DetailTabs({ product }: { product: ApiProductDetail }) {
  const [tab, setTab] = useState<TabKey>("desc");

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.key === tab);
    if (e.key === "ArrowRight") setTab(TABS[(i + 1) % TABS.length].key);
    else if (e.key === "ArrowLeft") setTab(TABS[(i - 1 + TABS.length) % TABS.length].key);
  };

  const longText = product.longDescription ?? product.description ?? "Детальний опис буде додано згодом.";
  const specs: { label: string; value: string }[] = [
    { label: "Категорія", value: product.categoryName ?? "Без категорії" },
    { label: "Наявність", value: product.inStock ? "В наявності" : "Немає в наявності" },
    { label: "Ціна", value: formatUAH(product.price) },
    ...(product.stock !== undefined ? [{ label: "Залишок", value: String(product.stock) }] : []),
  ];

  return (
    <div className="mt-8">
      <div role="tablist" aria-label="Деталі товару" onKeyDown={onKeyDown} className="flex flex-wrap gap-1 border-b border-[color:var(--line)]">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={active}
              aria-controls={`panel-${t.key}`}
              tabIndex={active ? 0 : -1}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-mint",
                active ? "border-mint text-navy-900" : "border-transparent text-navy-400 hover:text-navy-900",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0} className="pt-4 text-[15px] leading-[1.65] text-navy-700 focus:outline-none">
        {tab === "desc" && <p className="max-w-[60ch] whitespace-pre-line">{longText}</p>}
        {tab === "specs" && (
          <dl className="max-w-[480px] divide-y divide-[color:var(--line)] rounded-xl border border-[color:var(--line)]">
            {specs.map((s) => (
              <div key={s.label} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <dt className="text-sm text-navy-400">{s.label}</dt>
                <dd className="text-right text-sm font-medium text-navy-900">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

// ─── States ─────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <Container className="py-8 sm:py-12">
      <div className="mb-6 h-4 w-48 animate-pulse rounded bg-bone/60" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="aspect-square animate-pulse rounded-2xl bg-bone/50" />
        <div className="flex flex-col gap-4">
          <div className="h-6 w-24 animate-pulse rounded-full bg-bone/60" />
          <div className="h-9 w-3/4 animate-pulse rounded bg-bone/60" />
          <div className="h-7 w-40 animate-pulse rounded bg-bone/50" />
          <div className="h-16 w-full animate-pulse rounded bg-bone/40" />
          <div className="h-14 w-full animate-pulse rounded-xl bg-bone/50" />
          <div className="mt-4 h-40 w-full animate-pulse rounded bg-bone/30" />
        </div>
      </div>
    </Container>
  );
}

function NotFound() {
  return (
    <Container className="py-20">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-cream text-navy-400">
          <IcoTooth size={28} />
        </span>
        <h1 className="font-serif text-2xl text-navy-900">Товар не знайдено</h1>
        <p className="text-sm text-navy-400">
          Можливо, його прибрали з каталогу або посилання застаріле.
        </p>
        <Link href="/shop" className="mt-1 inline-flex items-center gap-2 rounded-full bg-navy-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-mint">
          Повернутися до каталогу
        </Link>
      </div>
    </Container>
  );
}
