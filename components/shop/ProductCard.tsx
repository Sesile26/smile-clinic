"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { IcoChild, IcoShield, IcoSparkle, IcoTooth } from "@/components/icons";
import type { ApiProduct } from "@/lib/shop-types";
import { formatUAH } from "./data";

/**
 * Category → decorative glyph (placeholder when a product has no photo).
 * Declared at module scope (not selected during render) so it keeps a stable
 * component identity.
 */
function CategoryGlyph({
  category,
  size,
}: {
  category: string | null;
  size: number;
}) {
  switch (category) {
    case "Відбілювання":
      return <IcoSparkle size={size} />;
    case "Дитячі":
      return <IcoChild size={size} />;
    case "Аксесуари":
      return <IcoShield size={size} />;
    default:
      return <IcoTooth size={size} />;
  }
}

interface ProductCardProps {
  product: ApiProduct;
  /** Offline → catalog is read-only, add button disabled. */
  disabled?: boolean;
  inCartQty: number;
  onAdd: () => void;
  /** false → no add-to-cart button (e.g. STAFF/ADMIN viewing the storefront —
   *  they don't buy; product management lives in /admin/products). Default true. */
  purchasable?: boolean;
}

export function ProductCard({
  product,
  disabled,
  inCartQty,
  onAdd,
  purchasable = true,
}: ProductCardProps) {
  // Product photos may be arbitrary external URLs; plain <img> + onError
  // fallback avoids touching next.config remotePatterns.
  const [imgError, setImgError] = useState(false);

  // `inStock` is the only availability signal a storefront card shows — never
  // the exact count (that's staff-only, in the admin table).
  const outOfStock = !product.inStock;
  const addDisabled = disabled || outOfStock;
  const showImage = !!product.imageUrl && !imgError;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white transition-[transform,box-shadow] duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-s2">
      {/* Image (real photo if provided, else brand gradient + glyph) */}
      <div className="relative aspect-[4/3] overflow-hidden bg-[linear-gradient(150deg,#0F1E36_0%,#0A1628_100%)]">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl ?? ""}
            alt=""
            onError={() => setImgError(true)}
            className={cn(
              "absolute inset-0 h-full w-full object-cover",
              outOfStock && "opacity-50 grayscale",
            )}
          />
        ) : (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_220px_at_80%_0%,rgba(0,201,167,0.28),transparent_60%)]"
            />
            <div
              className={cn(
                "absolute inset-0 grid place-items-center text-mint",
                outOfStock && "opacity-40",
              )}
            >
              <CategoryGlyph category={product.categoryName} size={56} />
            </div>
          </>
        )}

        {/* Left-top badge stack: "Рекомендовано" (featured) above the category. */}
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {product.isFeatured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-mint px-2.5 py-1 text-[11px] font-medium text-navy-900">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Рекомендовано
            </span>
          )}
          {product.categoryName && (
            <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-navy-900">
              {product.categoryName}
            </span>
          )}
        </div>

        {outOfStock && (
          <span className="absolute right-3 top-3 rounded-full bg-navy-900/90 px-2.5 py-1 text-[11px] font-medium text-white">
            Немає в наявності
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        {/* Title is the card's stretched link: its ::before covers the whole
            article, so clicking anywhere (except the buy button below, which is
            raised) navigates to the product page. */}
        <h3 className="font-serif text-[20px] leading-tight tracking-[-0.01em] text-navy-900">
          <Link
            href={`/shop/${product.id}`}
            className="outline-none transition-colors before:absolute before:inset-0 before:rounded-2xl before:content-[''] hover:text-mint-600 focus-visible:before:ring-2 focus-visible:before:ring-mint"
          >
            {product.name}
          </Link>
        </h3>
        {product.description && (
          <p className="mt-1.5 flex-1 text-sm leading-[1.5] text-navy-400">
            {product.description}
          </p>
        )}

        {/* Availability status only — never the exact number (storefront). */}
        <p
          className={cn(
            "mt-3 text-xs font-medium",
            outOfStock ? "text-red-600" : "text-mint-600",
          )}
        >
          {outOfStock ? "Немає в наявності" : "В наявності"}
        </p>

        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-lg font-medium tabular-nums text-navy-900">
            {formatUAH(product.price)}
          </span>
          {/* Buyers (PATIENT/guest) buy; STAFF/ADMIN don't — no add button. */}
          {purchasable && (
            <button
              type="button"
              // Raised above the title's stretched ::before so a click adds to
              // cart instead of navigating; stop propagation belt-and-braces.
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAdd();
              }}
              disabled={addDisabled}
              aria-label={
                outOfStock
                  ? `«${product.name}» немає в наявності`
                  : `Додати «${product.name}» в кошик`
              }
              className={cn(
                "relative z-[1] inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "bg-navy-900 text-white hover:bg-black",
              )}
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              {outOfStock
                ? "Немає"
                : inCartQty > 0
                  ? `У кошику · ${inCartQty}`
                  : "Додати"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
