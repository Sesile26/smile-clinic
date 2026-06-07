"use client";

import { cn } from "@/lib/cn";
import {
  IcoChild,
  IcoShield,
  IcoSparkle,
  IcoTooth,
  type IconProps,
} from "@/components/icons";
import { formatUAH, type Category, type Product } from "./data";

/** Category → decorative icon (no product photos in this mock). */
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
}

export function ProductCard({
  product,
  disabled,
  inCartQty,
  onAdd,
}: ProductCardProps) {
  const Icon = CATEGORY_ICON[product.category];

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white transition-[transform,box-shadow] duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-s2">
      {/* Decorative image placeholder (brand gradient + category glyph) */}
      <div className="relative aspect-[4/3] overflow-hidden bg-[linear-gradient(150deg,#0F1E36_0%,#0A1628_100%)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_220px_at_80%_0%,rgba(0,201,167,0.28),transparent_60%)]"
        />
        <div className="absolute inset-0 grid place-items-center text-mint">
          <Icon size={56} />
        </div>
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-navy-900">
          {product.category}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-serif text-[20px] leading-tight tracking-[-0.01em] text-navy-900">
          {product.name}
        </h3>
        <p className="mt-1.5 flex-1 text-sm leading-[1.5] text-navy-400">
          {product.description}
        </p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-lg font-medium tabular-nums text-navy-900">
            {formatUAH(product.price)}
          </span>
          <button
            type="button"
            onClick={onAdd}
            disabled={disabled}
            aria-label={`Додати «${product.name}» в кошик`}
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
            {inCartQty > 0 ? `У кошику · ${inCartQty}` : "Додати"}
          </button>
        </div>
      </div>
    </article>
  );
}
