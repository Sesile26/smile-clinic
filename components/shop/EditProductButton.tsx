"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { useShopRole, isShopManager } from "@/hooks/useShop";
import { updateProduct, ShopApiError } from "@/lib/shop-client";
import { useShopCategories } from "./useShopCategories";
import { ProductFormModal, type ProductFormValues } from "./ProductFormModal";
import type { ApiProduct } from "@/lib/shop-types";

interface EditProductButtonProps {
  product: ApiProduct;
  /** Called with the server's updated product after a successful save. */
  onSaved: (updated: ApiProduct) => void;
  /** "card" → compact overlay pill for catalog cards; "inline" → standalone. */
  variant?: "card" | "inline";
  className?: string;
}

/**
 * Edit-product entry point for STAFF/ADMIN, reused on the storefront (catalog
 * cards + product page). Renders NOTHING for buyers/guests — and the mutation
 * API re-checks the role server-side regardless, so this is a UI gate only.
 *
 * Opens the SAME ProductFormModal as /admin/products; on save it PATCHes
 * /api/products/[id] and hands the updated product back via onSaved so the
 * caller refreshes in place. Categories load lazily (only once the modal opens)
 * so a catalog full of cards doesn't each fire a categories fetch.
 */
export function EditProductButton({
  product,
  onSaved,
  variant = "inline",
  className,
}: EditProductButtonProps) {
  const { role } = useShopRole();
  const [open, setOpen] = useState(false);

  if (!isShopManager(role)) return null;

  const trigger =
    variant === "card"
      ? "inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-navy-900 shadow-s1 backdrop-blur-[6px] transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
      : "inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line-2)] bg-white px-3.5 py-2 text-sm font-medium text-navy-900 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint";

  return (
    <>
      <button
        type="button"
        // The catalog card is a stretched <Link>; prevent it from navigating.
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className={cn(trigger, className)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
        Редагувати
      </button>
      {open && (
        <ProductEditor
          product={product}
          onSaved={(u) => {
            onSaved(u);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Mounted only while the modal is open → useShopCategories fires on demand. */
function ProductEditor({
  product,
  onSaved,
  onClose,
}: {
  product: ApiProduct;
  onSaved: (updated: ApiProduct) => void;
  onClose: () => void;
}) {
  const cats = useShopCategories();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (values: ProductFormValues) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProduct(product.id, values);
      onSaved(updated); // parent closes → this unmounts (no further setState)
    } catch (e) {
      setError(
        e instanceof ShopApiError ? e.message : "Не вдалося зберегти товар.",
      );
      setSaving(false);
    }
  };

  return (
    <ProductFormModal
      key={product.id}
      initial={product}
      categories={cats.categories}
      submitting={saving}
      error={error}
      onSave={handleSave}
      onClose={() => {
        if (saving) return;
        onClose();
      }}
    />
  );
}
