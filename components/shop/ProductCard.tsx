"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  IcoChild,
  IcoShield,
  IcoSparkle,
  IcoTooth,
  type IconProps,
} from "@/components/icons";
import {
  formatUAH,
  type Category,
  type Product,
  type ShopRole,
} from "./data";

/** Category → decorative icon (placeholder when a product has no photo). */
const CATEGORY_ICON: Record<Category, (p: IconProps) => React.JSX.Element> = {
  Догляд: IcoTooth,
  Відбілювання: IcoSparkle,
  Дитячі: IcoChild,
  Аксесуари: IcoShield,
};

interface ProductCardProps {
  product: Product;
  /** Offline → catalog is read-only, add button disabled. */
  disabled?: boolean;
  inCartQty: number;
  onAdd: () => void;
  /** "admin" reveals the manage actions; "buyer" never sees them. */
  role: ShopRole;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProductCard({
  product,
  disabled,
  inCartQty,
  onAdd,
  role,
  onEdit,
  onDelete,
}: ProductCardProps) {
  const Icon = CATEGORY_ICON[product.category];
  // Product photos may be arbitrary external URLs; plain <img> + onError
  // fallback avoids touching next.config remotePatterns.
  const [imgError, setImgError] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const outOfStock = product.stock <= 0;
  const maxedInCart = inCartQty >= product.stock;
  const addDisabled = disabled || outOfStock || maxedInCart;
  const showImage = !!product.imageUrl && !imgError;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white transition-[transform,box-shadow] duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-s2">
      {/* Image (real photo if provided, else brand gradient + glyph) */}
      <div className="relative aspect-[4/3] overflow-hidden bg-[linear-gradient(150deg,#0F1E36_0%,#0A1628_100%)]">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
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
              <Icon size={56} />
            </div>
          </>
        )}

        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-navy-900">
          {product.category}
        </span>

        {outOfStock && (
          <span className="absolute right-3 top-3 rounded-full bg-navy-900/90 px-2.5 py-1 text-[11px] font-medium text-white">
            Немає в наявності
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-serif text-[20px] leading-tight tracking-[-0.01em] text-navy-900">
          {product.name}
        </h3>
        <p className="mt-1.5 flex-1 text-sm leading-[1.5] text-navy-400">
          {product.description}
        </p>

        {/* Stock line */}
        <p
          className={cn(
            "mt-3 text-xs font-medium",
            outOfStock ? "text-red-600" : "text-navy-400",
          )}
        >
          {outOfStock ? "Немає в наявності" : `В наявності: ${product.stock} шт`}
        </p>

        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-lg font-medium tabular-nums text-navy-900">
            {formatUAH(product.price)}
          </span>
          <button
            type="button"
            onClick={onAdd}
            disabled={addDisabled}
            aria-label={
              outOfStock
                ? `«${product.name}» немає в наявності`
                : `Додати «${product.name}» в кошик`
            }
            title={
              maxedInCart && !outOfStock
                ? "Більше немає в наявності"
                : undefined
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200",
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
        </div>

        {/* ── Admin/staff manage actions (hidden from buyers) ──────────────
            NOTE: mock only — edits live in local state. Persisting to the DB
            will be wired during integration. */}
        {role === "admin" && (
          <div className="mt-4 border-t border-[color:var(--line)] pt-3">
            {confirmingDelete ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-navy-700">
                  Видалити товар?
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onDelete}
                    className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  >
                    Так, видалити
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="rounded-full border border-[color:var(--line-2)] px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
                  >
                    Скасувати
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-[color:var(--line-2)] px-3 py-2 text-xs font-medium text-navy-900 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                  Редагувати
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-[color:var(--line-2)] px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:border-red-600 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                  Видалити
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
