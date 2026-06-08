"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { btnBase, btnGhost, btnMint } from "@/lib/buttons";
import { IcoClose } from "@/components/icons";
import type { ApiProduct } from "@/lib/shop-types";
import { CATEGORIES } from "./data";

/** Payload the parent sends to the API (id is server-assigned on create). */
export interface ProductFormValues {
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  imageUrl?: string;
}

interface ProductFormModalProps {
  /** null → "add" mode; a product → "edit" mode (prefilled). */
  initial: ApiProduct | null;
  onSave: (values: ProductFormValues) => void;
  onClose: () => void;
  /** Submit in flight — disables actions. */
  submitting?: boolean;
  /** Server error from the last save attempt. */
  error?: string | null;
}

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
  onSave,
  onClose,
  submitting = false,
  error = null,
}: ProductFormModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [stock, setStock] = useState(initial ? String(initial.stock) : "");
  const [category, setCategory] = useState<string>(
    initial?.category ?? CATEGORIES[0],
  );
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [touched, setTouched] = useState(false);

  // Scroll lock + autofocus + focus restore (runs once for this mount).
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLInputElement>("[data-autofocus]")
        ?.focus();
    }, 60);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = "";
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
      category,
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
          className="flex flex-col gap-4 overflow-y-auto px-6 py-5"
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
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={fieldInput}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pf-image" className={fieldLabel}>
              URL зображення (необов’язково)
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
              disabled={submitting}
              className={cn(
                btnBase,
                btnMint,
                "flex-1 justify-center",
                submitting && "opacity-70",
              )}
            >
              {submitting
                ? "Збереження…"
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
