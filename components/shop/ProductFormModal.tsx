"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scroll-lock";
import { btnBase, btnGhost, btnMint } from "@/lib/buttons";
import { IcoClose } from "@/components/icons";
import { uploadProductImage } from "@/lib/admin-products";
import { getProduct } from "@/lib/shop-client";
import type { ApiProduct } from "@/lib/shop-types";
import type { ShopCategory } from "./useShopCategories";

/** Client-side mirror of the server's upload limits (UX only — server re-checks). */
const ACCEPT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_UPLOAD_BYTES = Math.floor(4.5 * 1024 * 1024);
/** Max gallery photos per product — mirrors the server (parseImages). */
const MAX_IMAGES = 8;

/** Payload the parent sends to the API (id is server-assigned on create). */
export interface ProductFormValues {
  name: string;
  description: string;
  price: number;
  stock: number;
  /** Existing category id, or null for "Без категорії". */
  categoryId: string | null;
  /** Cover photo (one of `images`); empty → brand placeholder. */
  imageUrl?: string;
  /** Ordered gallery (variant A) — saved order = display order. */
  images: string[];
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
  // Gallery (variant A): `images` is the ordered list; `mainUrl` is the cover
  // (one of `images`, written to Product.imageUrl). `initial` is an ApiProduct
  // (no gallery), so seed the cover immediately and fetch the full ordered
  // images[] on open (below).
  const [images, setImages] = useState<string[]>(
    initial?.imageUrl ? [initial.imageUrl] : [],
  );
  const [mainUrl, setMainUrl] = useState(initial?.imageUrl ?? "");
  const [touched, setTouched] = useState(false);

  // Portal to <body> (SSR-safe). The modal is `position: fixed`, but when it's
  // opened from a /shop card the card's hover transform + overflow-hidden would
  // otherwise become its containing block — clipping it and letting clicks fall
  // through to the card's stretched link. Rendering into <body> escapes that.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  // On edit, load the authoritative ordered gallery from the DB (the passed-in
  // ApiProduct only carries the cover). Normalize so the cover is part of the
  // list (legacy/uploaded products may have imageUrl set but images empty).
  useEffect(() => {
    if (!initial?.id) return;
    let active = true;
    getProduct(initial.id)
      .then((d) => {
        if (!active || !d) return;
        const cover = d.imageUrl ?? "";
        const full =
          cover && !d.images.includes(cover) ? [cover, ...d.images] : d.images;
        const gallery = full.length ? full : cover ? [cover] : [];
        setImages(gallery.slice(0, MAX_IMAGES));
        setMainUrl(cover || gallery[0] || "");
      })
      .catch(() => {
        /* keep the cover-only seed on failure */
      });
    return () => {
      active = false;
    };
  }, [initial?.id]);

  // ── Image upload (Vercel Blob via /api/admin/products/upload) ──────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Upload one-by-one (the route is single-file; ≤4.5 MB each, sidestepping the
  // Vercel server-upload body limit). Each URL is appended to the gallery; the
  // first photo added to an empty gallery becomes the cover by default.
  const handleFiles = useCallback(
    async (fileList: FileList | File[] | null | undefined) => {
      const files = Array.from(fileList ?? []);
      if (files.length === 0) return;
      setUploadError(null);
      setUploading(true);
      const added: string[] = [];
      let err: string | null = null;
      try {
        for (const file of files) {
          if (images.length + added.length >= MAX_IMAGES) {
            err = `Можна додати щонайбільше ${MAX_IMAGES} фото`;
            break;
          }
          if (!ACCEPT_TYPES.includes(file.type)) {
            err = "Лише зображення JPEG, PNG або WebP";
            continue;
          }
          if (file.size > MAX_UPLOAD_BYTES) {
            err = "Деякі фото завеликі (макс. 4.5 МБ)";
            continue;
          }
          try {
            added.push(await uploadProductImage(file));
          } catch (e) {
            err = e instanceof Error ? e.message : "Не вдалося завантажити фото";
          }
        }
      } finally {
        if (added.length > 0) {
          setImages((prev) => [...prev, ...added].slice(0, MAX_IMAGES));
          setMainUrl((prev) => prev || added[0]);
        }
        if (err) setUploadError(err);
        setUploading(false);
      }
    },
    [images.length],
  );

  // Remove a photo. If it was the cover, the next remaining photo becomes cover
  // (never leave imageUrl pointing at a removed URL).
  const removeImage = (url: string) => {
    const next = images.filter((u) => u !== url);
    setImages(next);
    if (mainUrl === url) setMainUrl(next[0] ?? "");
    setUploadError(null);
  };

  // Mark a gallery photo as the cover (→ Product.imageUrl on save).
  const makeMain = (url: string) => setMainUrl(url);

  // Move a photo to a new index (drag&drop drop target, or arrow buttons).
  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // Manual URL entry (keeps external placehold.co photos working) → appended.
  const [urlDraft, setUrlDraft] = useState("");
  const addUrl = () => {
    const u = urlDraft.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) {
      setUploadError("URL має починатися з http:// або https://");
      return;
    }
    if (images.length >= MAX_IMAGES) {
      setUploadError(`Можна додати щонайбільше ${MAX_IMAGES} фото`);
      return;
    }
    if (!images.includes(u)) {
      setImages((prev) => [...prev, u]);
      setMainUrl((prev) => prev || u);
    }
    setUrlDraft("");
    setUploadError(null);
  };

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
      // Cover = the marked main (default: first); gallery in its saved order.
      imageUrl: (mainUrl || images[0] || "").trim() || undefined,
      images,
    });
  };

  if (!mounted) return null;

  return createPortal(
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

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className={fieldLabel}>Галерея (необов’язково)</span>
              <span className="text-xs tabular-nums text-navy-400">
                {images.length}/{MAX_IMAGES}
              </span>
            </div>

            {/* Thumbnails in saved order. Drag to reorder; star = cover; × = remove. */}
            {images.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {images.map((url, i) => {
                  const isMain = url === mainUrl;
                  return (
                    <li
                      key={url}
                      draggable
                      onDragStart={() => setDragIndex(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragIndex !== null) moveImage(dragIndex, i);
                        setDragIndex(null);
                      }}
                      onDragEnd={() => setDragIndex(null)}
                      className={cn(
                        "group relative aspect-square cursor-grab overflow-hidden rounded-lg border bg-cream/40 active:cursor-grabbing",
                        isMain
                          ? "border-mint-600 ring-2 ring-mint-600/40"
                          : "border-[color:var(--line-2)]",
                        dragIndex === i && "opacity-50",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />

                      {isMain && (
                        <span className="absolute bottom-1 left-1 rounded-full bg-mint px-1.5 py-0.5 text-[10px] font-medium text-navy-900">
                          Головне
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => makeMain(url)}
                        aria-pressed={isMain}
                        aria-label={isMain ? "Головне фото" : "Зробити головним"}
                        title={isMain ? "Головне фото" : "Зробити головним"}
                        className={cn(
                          "absolute left-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 shadow-s1 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                          isMain ? "text-mint-600" : "text-navy-400 hover:text-navy-700",
                        )}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill={isMain ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                      </button>

                      <button
                        type="button"
                        onClick={() => removeImage(url)}
                        aria-label="Видалити фото"
                        title="Видалити фото"
                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-navy-700 shadow-s1 transition-colors hover:bg-white hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
                      >
                        <IcoClose size={12} />
                      </button>

                      {/* Arrow reorder — keyboard/touch fallback for drag&drop. */}
                      <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button type="button" onClick={() => moveImage(i, i - 1)} disabled={i === 0} aria-label="Перемістити ліворуч" className="grid h-5 w-5 place-items-center rounded bg-white/90 text-navy-700 shadow-s1 disabled:opacity-30">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
                        </button>
                        <button type="button" onClick={() => moveImage(i, i + 1)} disabled={i === images.length - 1} aria-label="Перемістити праворуч" className="grid h-5 w-5 place-items-center rounded bg-white/90 text-navy-700 shadow-s1 disabled:opacity-30">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Add zone — uploads MULTIPLE files (one request each). */}
            {images.length < MAX_IMAGES && (
              <div
                role="button"
                tabIndex={0}
                aria-label="Додати фото"
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
                  if (!uploading) void handleFiles(e.dataTransfer.files);
                }}
                className={cn(
                  "relative grid min-h-[84px] cursor-pointer place-items-center rounded-lg border border-dashed px-3 py-3 text-center text-xs transition-[border,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                  dragOver
                    ? "border-mint-600 shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
                    : "border-[color:var(--line-2)] hover:border-navy-400",
                  uploading && "pointer-events-none opacity-80",
                )}
              >
                <span className="text-navy-500">
                  {uploading ? (
                    "Завантаження…"
                  ) : (
                    <>
                      Перетягніть фото або{" "}
                      <span className="font-medium text-navy-900 underline">
                        оберіть файли
                      </span>
                      <br />
                      JPEG, PNG, WebP · до 4.5 МБ · до {MAX_IMAGES} фото
                    </>
                  )}
                </span>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_TYPES.join(",")}
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = ""; // allow re-selecting the same file(s)
              }}
            />

            {uploadError && <span className={fieldError}>{uploadError}</span>}

            {/* Manual URL → appended to the gallery (keeps placehold.co working). */}
            <div className="mt-1 flex gap-2">
              <input
                type="url"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addUrl();
                  }
                }}
                placeholder="…або вставте URL зображення"
                className={cn(fieldInput, "flex-1")}
              />
              <button
                type="button"
                onClick={addUrl}
                className={cn(btnBase, btnGhost, "shrink-0 px-3")}
              >
                Додати
              </button>
            </div>

            <span className="text-xs text-navy-400">
              Перше фото за замовчуванням головне; познач зірочкою інше. Порядок —
              перетягуванням. Якщо порожньо — буде брендовий плейсхолдер.
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
    </div>,
    document.body,
  );
}
