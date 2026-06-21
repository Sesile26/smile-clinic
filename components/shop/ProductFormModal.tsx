"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scroll-lock";
import { btnBase, btnGhost, btnMint } from "@/lib/buttons";
import { IcoClose } from "@/components/icons";
import { uploadProductImage } from "@/lib/admin-products";
import type { ApiProduct } from "@/lib/shop-types";
import type { ShopCategory } from "./useShopCategories";

/** Client-side mirror of the server's upload limits (UX only — server re-checks). */
const ACCEPT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_UPLOAD_BYTES = Math.floor(4.5 * 1024 * 1024);

/** Payload the parent sends to the API (id is server-assigned on create). */
export interface ProductFormValues {
  name: string;
  description: string;
  price: number;
  stock: number;
  /** Existing category id, or null for "Без категорії". */
  categoryId: string | null;
  imageUrl?: string;
}

interface ProductFormModalProps {
  /** null → "add" mode; a product → "edit" mode (prefilled). */
  initial: ApiProduct | null;
  /** Managed categories for the select (from useShopCategories). */
  categories: ShopCategory[];
  onSave: (values: ProductFormValues) => void;
  onClose: () => void;
  /** Submit in flight — disables actions. */
  submitting?: boolean;
  /** Server error from the last save attempt. */
  error?: string | null;
}

/** Select value for "Без категорії" (empty category on save). */
const NO_CATEGORY = "";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const fieldLabel = "text-xs font-medium tracking-[0.04em] text-navy-700";
const fieldInput =
  "w-full rounded-lg border border-[color:var(--line-2)] bg-white py-2.5 px-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]";
const fieldError = "text-xs text-red-500";

/**
 * Add/Edit product dialog (admin/staff only). Mounted ONLY while open and keyed
 * by product id in the parent, so the lazy useState initializers below act as
 * the prefill — no prop→state syncing effect (keeps renders clean).
 *
 * a11y mirrors LoginModal/ConfirmModal: role=dialog + aria-modal, scroll lock,
 * Escape, focus trap, focus restore. MOCK ONLY — onSave mutates the parent's
 * local list; DB persistence is wired during integration.
 */
export function ProductFormModal({
  initial,
  categories,
  onSave,
  onClose,
  submitting = false,
  error = null,
}: ProductFormModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  // Managers always receive the exact stock; guard the optional field anyway.
  const [stock, setStock] = useState(
    initial?.stock != null ? String(initial.stock) : "",
  );
  // Default to the product's own category id (edit) or "Без категорії" (add).
  const [categoryId, setCategoryId] = useState<string>(
    initial?.categoryId ?? NO_CATEGORY,
  );
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [touched, setTouched] = useState(false);

  // ── Image upload (Vercel Blob via /api/admin/products/upload) ──────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File | undefined | null) => {
    if (!file) return;
    setUploadError(null);
    // Pre-validate client-side for instant feedback; the server re-checks.
    if (!ACCEPT_TYPES.includes(file.type)) {
      setUploadError("Лише зображення JPEG, PNG або WebP");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError("Зображення завелике (макс. 4.5 МБ)");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadProductImage(file);
      setImageUrl(url);
    } catch (e) {
      setUploadError(
        e instanceof Error ? e.message : "Не вдалося завантажити зображення",
      );
    } finally {
      setUploading(false);
    }
  }, []);

  // Scroll lock + autofocus + focus restore (runs once for this mount).
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    lockBodyScroll();
    const t = window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLInputElement>("[data-autofocus]")
        ?.focus();
    }, 60);
    return () => {
      window.clearTimeout(t);
      unlockBodyScroll();
      previouslyFocused?.focus?.();
    };
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const list = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((el) => el.offsetParent !== null);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  const priceNum = Number(price);
  const stockNum = Number(stock);
  const nameValid = name.trim().length >= 2;
  const priceValid = price !== "" && Number.isFinite(priceNum) && priceNum >= 0;
  const stockValid =
    stock !== "" && Number.isInteger(stockNum) && stockNum >= 0;
  const canSave = nameValid && priceValid && stockValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSave) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      price: Math.round(priceNum),
      stock: Math.round(stockNum),
      categoryId: categoryId === NO_CATEGORY ? null : categoryId,
      imageUrl: imageUrl.trim() || undefined,
    });
  };

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[110] grid place-items-center bg-[rgba(10,22,40,0.55)] p-5 backdrop-blur-[10px]"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="productFormTitle"
        className="relative flex max-h-[90vh] w-full max-w-[480px] flex-col overflow-hidden rounded-2xl bg-white shadow-s3"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-6 py-4">
          <h2
            id="productFormTitle"
            className="font-serif text-[22px] leading-none tracking-[-0.01em] text-navy-900"
          >
            {initial ? "Редагувати товар" : "Додати товар"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="grid h-9 w-9 place-items-center rounded-full text-navy-400 transition-colors hover:bg-cream hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
          >
            <IcoClose size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4 overflow-y-auto scrollbar-none px-6 py-5"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pf-name" className={fieldLabel}>
              Назва
            </label>
            <input
              id="pf-name"
              data-autofocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Напр. Зубна паста Mint Fresh"
              className={fieldInput}
              aria-invalid={touched && !nameValid}
            />
            {touched && !nameValid && (
              <span className={fieldError}>Вкажіть назву (мін. 2 символи)</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pf-desc" className={fieldLabel}>
              Опис
            </label>
            <textarea
              id="pf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Короткий опис товару"
              rows={2}
              className={cn(fieldInput, "resize-none")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pf-price" className={fieldLabel}>
                Ціна, ₴
              </label>
              <input
                id="pf-price"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="199"
                className={fieldInput}
                aria-invalid={touched && !priceValid}
              />
              {touched && !priceValid && (
                <span className={fieldError}>Невалідна ціна</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pf-stock" className={fieldLabel}>
                Залишок, шт
              </label>
              <input
                id="pf-stock"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="10"
                className={fieldInput}
                aria-invalid={touched && !stockValid}
              />
              {touched && !stockValid && (
                <span className={fieldError}>Ціле число ≥ 0</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pf-category" className={fieldLabel}>
              Категорія
            </label>
            <select
              id="pf-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={fieldInput}
            >
              <option value={NO_CATEGORY}>Без категорії</option>
              {/* Keep the product's current category selectable even if it's
                  missing from the loaded list (rare race). */}
              {(initial?.categoryId &&
              !categories.some((c) => c.id === initial.categoryId)
                ? [
                    { id: initial.categoryId, name: initial.categoryName ?? "—" },
                    ...categories,
                  ]
                : categories
              ).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={fieldLabel}>Зображення (необов’язково)</span>

            {/* Drop zone / click to pick a file → uploads to Vercel Blob. */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Завантажити зображення"
              aria-busy={uploading}
              onClick={() => !uploading && fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !uploading) {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (!uploading) void handleFile(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                "relative grid min-h-[132px] cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed bg-cream/40 px-3 py-4 text-center transition-[border,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                dragOver
                  ? "border-mint-600 shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
                  : "border-[color:var(--line-2)] hover:border-navy-400",
                uploading && "pointer-events-none opacity-80",
              )}
            >
              {imageUrl ? (
                <>
                  {/* Preview of the current image (uploaded OR pasted URL). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt="Прев’ю зображення товару"
                    className="max-h-[160px] w-auto rounded-md object-contain"
                  />
                  <button
                    type="button"
                    aria-label="Прибрати зображення"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageUrl("");
                      setUploadError(null);
                    }}
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-navy-700 shadow-s1 transition-colors hover:bg-white hover:text-navy-900"
                  >
                    <IcoClose size={14} />
                  </button>
                </>
              ) : (
                <span className="text-xs text-navy-500">
                  Перетягніть фото сюди або{" "}
                  <span className="font-medium text-navy-900 underline">
                    оберіть файл
                  </span>
                  <br />
                  JPEG, PNG або WebP, до 4.5 МБ
                </span>
              )}

              {uploading && (
                <div className="absolute inset-0 grid place-items-center bg-white/70 text-xs font-medium text-navy-700">
                  Завантаження…
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_TYPES.join(",")}
              className="hidden"
              onChange={(e) => {
                void handleFile(e.target.files?.[0]);
                e.target.value = ""; // allow re-selecting the same file
              }}
            />

            {uploadError && <span className={fieldError}>{uploadError}</span>}

            {/* Alternative: paste an external URL (keeps existing placehold.co
                products working — no upload required). */}
            <label htmlFor="pf-image" className={cn(fieldLabel, "mt-1")}>
              …або вставте URL зображення
            </label>
            <input
              id="pf-image"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              className={fieldInput}
            />
            <span className="text-xs text-navy-400">
              Якщо порожньо — буде брендовий плейсхолдер.
            </span>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <div className="mt-1 flex flex-col gap-2.5 sm:flex-row-reverse">
            <button
              type="submit"
              disabled={submitting || uploading}
              className={cn(
                btnBase,
                btnMint,
                "flex-1 justify-center",
                (submitting || uploading) && "opacity-70",
              )}
            >
              {submitting
                ? "Збереження…"
                : uploading
                  ? "Завантаження фото…"
                  : initial
                    ? "Зберегти зміни"
                    : "Додати товар"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={cn(btnBase, btnGhost, "flex-1 justify-center")}
            >
              Скасувати
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
