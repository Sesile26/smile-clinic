"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { btnBase, btnGhost, btnMint } from "@/lib/buttons";
import { IcoClose } from "@/components/icons";
import { OfflineNotice } from "./StatePanels";
import type {
  CatLoadState,
  MutationResult,
  ShopCategory,
} from "./useShopCategories";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const fieldInput =
  "w-full rounded-lg border border-[color:var(--line-2)] bg-white py-2.5 px-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]";
const fieldError = "text-xs text-red-500";

interface CategoriesModalProps {
  categories: ShopCategory[];
  uncategorizedCount: number;
  state: CatLoadState;
  /** Offline → catalog management is read-only; mutations are disabled. */
  online: boolean;
  onAdd: (name: string) => Promise<MutationResult>;
  onRename: (id: string, name: string) => Promise<MutationResult>;
  onRemove: (id: string) => Promise<MutationResult>;
  onReload: () => void;
  onClose: () => void;
}

/**
 * Manage product categories (ADMIN/STAFF only). Backed by /api/categories via
 * the parent's useShopCategories store. a11y mirrors ProductFormModal:
 * role=dialog + aria-modal, scroll lock, Escape, focus trap, focus restore.
 *
 * Sub-flows: add (validated input), inline rename, and delete with a
 * confirmation that warns when a category still holds products and offers to
 * move them to "Без категорії". Offline the list stays viewable but every
 * mutation is disabled (no offline write queue — mutations are online-only).
 */
export function CategoriesModal({
  categories,
  uncategorizedCount,
  state,
  online,
  onAdd,
  onRename,
  onRemove,
  onReload,
  onClose,
}: CategoriesModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // A request is in flight — disables actions to avoid double-submits.
  const [busy, setBusy] = useState(false);

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
        // Escape backs out of an inline edit / confirm first, else closes.
        if (editingId) {
          setEditingId(null);
          setEditError(null);
        } else if (confirmId) {
          setConfirmId(null);
          setRemoveError(null);
        } else {
          onClose();
        }
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
    [onClose, editingId, confirmId],
  );

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !online) return;
    setBusy(true);
    const res = await onAdd(newName);
    setBusy(false);
    if (res.ok) {
      setNewName("");
      setAddError(null);
    } else {
      setAddError(res.error ?? "Не вдалося додати");
    }
  };

  const startEdit = (c: ShopCategory) => {
    setConfirmId(null);
    setRemoveError(null);
    setEditingId(c.id);
    setEditName(c.name);
    setEditError(null);
  };
  const submitEdit = async (id: string) => {
    if (busy || !online) return;
    setBusy(true);
    const res = await onRename(id, editName);
    setBusy(false);
    if (res.ok) {
      setEditingId(null);
      setEditError(null);
    } else {
      setEditError(res.error ?? "Не вдалося перейменувати");
    }
  };

  const confirmRemove = async (id: string) => {
    if (busy || !online) return;
    setBusy(true);
    const res = await onRemove(id);
    setBusy(false);
    if (res.ok) {
      setConfirmId(null);
      setRemoveError(null);
    } else {
      setRemoveError(res.error ?? "Не вдалося видалити");
    }
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
        aria-labelledby="categoriesTitle"
        className="relative flex max-h-[90vh] w-full max-w-[480px] flex-col overflow-hidden rounded-2xl bg-white shadow-s3"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-6 py-4">
          <h2
            id="categoriesTitle"
            className="font-serif text-[22px] leading-none tracking-[-0.01em] text-navy-900"
          >
            Категорії товарів
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

        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
          {!online && (
            <OfflineNotice message="Ви офлайн. Категорії показано лише для перегляду — зміни доступні лише онлайн." />
          )}

          {/* Add new category */}
          <form onSubmit={submitAdd} noValidate className="flex flex-col gap-1.5">
            <label htmlFor="cat-new" className="sr-only">
              Нова категорія
            </label>
            <div className="flex gap-2">
              <input
                id="cat-new"
                data-autofocus
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (addError) setAddError(null);
                }}
                placeholder="Нова категорія…"
                className={fieldInput}
                aria-invalid={!!addError}
                aria-describedby={addError ? "cat-new-error" : undefined}
              />
              <button
                type="submit"
                disabled={state !== "ready" || busy || !online || !newName.trim()}
                className={cn(
                  btnBase,
                  btnMint,
                  "shrink-0 justify-center px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                Додати
              </button>
            </div>
            {addError && (
              <span id="cat-new-error" className={fieldError} role="alert">
                {addError}
              </span>
            )}
          </form>

          {/* List / states */}
          {state === "loading" ? (
            <SkeletonRows />
          ) : state === "error" ? (
            <ErrorPanel onRetry={onReload} />
          ) : categories.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[color:var(--line-2)] bg-cream/40 px-4 py-8 text-center text-sm text-navy-400">
              Ще немає категорій. Додайте першу полем вище.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[color:var(--line)] rounded-lg border border-[color:var(--line)]">
              {categories.map((c) => (
                <li key={c.id} className="px-3.5 py-2.5">
                  {editingId === c.id ? (
                    <InlineEdit
                      value={editName}
                      error={editError}
                      onChange={(v) => {
                        setEditName(v);
                        if (editError) setEditError(null);
                      }}
                      onSave={() => submitEdit(c.id)}
                      onCancel={() => {
                        setEditingId(null);
                        setEditError(null);
                      }}
                    />
                  ) : confirmId === c.id ? (
                    <DeleteConfirm
                      count={c.count}
                      busy={busy}
                      error={removeError}
                      onConfirm={() => confirmRemove(c.id)}
                      onCancel={() => {
                        setConfirmId(null);
                        setRemoveError(null);
                      }}
                    />
                  ) : (
                    <Row
                      category={c}
                      disabled={!online}
                      onEdit={() => startEdit(c)}
                      onDelete={() => {
                        setEditingId(null);
                        setRemoveError(null);
                        setConfirmId(c.id);
                      }}
                    />
                  )}
                </li>
              ))}
              {uncategorizedCount > 0 && (
                <li className="flex items-center justify-between gap-3 bg-cream/40 px-3.5 py-2.5">
                  <span className="text-sm italic text-navy-400">
                    Без категорії
                  </span>
                  <CountBadge count={uncategorizedCount} muted />
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="border-t border-[color:var(--line)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className={cn(btnBase, btnGhost, "w-full justify-center")}
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Row (default state) ─────────────────────────────────────────────────────

function Row({
  category,
  disabled,
  onEdit,
  onDelete,
}: {
  category: ShopCategory;
  /** Offline → management actions are disabled. */
  disabled?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="truncate text-sm font-medium text-navy-900">
          {category.name}
        </span>
        <CountBadge count={category.count} />
      </div>
      <div className="flex shrink-0 gap-1">
        <IconBtn
          label={`Перейменувати «${category.name}»`}
          onClick={onEdit}
          disabled={disabled}
          path="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"
        />
        <IconBtn
          label={`Видалити «${category.name}»`}
          onClick={onDelete}
          danger
          disabled={disabled}
          path="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
        />
      </div>
    </div>
  );
}

// ─── Inline rename ───────────────────────────────────────────────────────────

function InlineEdit({
  value,
  error,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  error: string | null;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSave();
            }
          }}
          aria-label="Нова назва категорії"
          aria-invalid={!!error}
          className={cn(fieldInput, "py-2")}
        />
        <button
          type="button"
          onClick={onSave}
          disabled={!value.trim()}
          className="shrink-0 rounded-full bg-navy-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:opacity-50"
        >
          Зберегти
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 rounded-full border border-[color:var(--line-2)] px-3 py-2 text-xs font-medium text-navy-700 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
        >
          Скасувати
        </button>
      </div>
      {error && (
        <span className={fieldError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

// ─── Delete confirmation ─────────────────────────────────────────────────────

function DeleteConfirm({
  count,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  count: number;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const hasProducts = count > 0;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-navy-700">
        {hasProducts ? (
          <>
            У категорії <span className="font-medium">{count}</span>{" "}
            {pluralProducts(count)}. Видалити та перенести їх у «Без категорії»?
          </>
        ) : (
          "Видалити цю категорію?"
        )}
      </p>
      {error && (
        <span className={fieldError} role="alert">
          {error}
        </span>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
        >
          {hasProducts ? "Перенести в «Без категорії»" : "Видалити"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full border border-[color:var(--line-2)] px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:opacity-50"
        >
          Скасувати
        </button>
      </div>
    </div>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────────

function CountBadge({ count, muted }: { count: number; muted?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        muted ? "bg-navy-900/[0.06] text-navy-400" : "bg-cream text-navy-700",
      )}
    >
      {count} {pluralProducts(count)}
    </span>
  );
}

function IconBtn({
  label,
  onClick,
  path,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  path: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40",
        danger
          ? "text-red-600 hover:bg-red-50 focus-visible:ring-red-400"
          : "text-navy-700 hover:bg-cream focus-visible:ring-mint",
      )}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={path} />
      </svg>
    </button>
  );
}

function SkeletonRows() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col divide-y divide-[color:var(--line)] rounded-lg border border-[color:var(--line)]"
    >
      <span className="sr-only">Завантаження категорій…</span>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-3.5 py-3">
          <div className="h-4 w-32 animate-pulse rounded bg-bone/60" />
          <div className="h-6 w-16 animate-pulse rounded-full bg-bone/50" />
        </div>
      ))}
    </div>
  );
}

function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-4"
    >
      <p className="text-sm font-medium text-red-800">
        Не вдалося завантажити категорії.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
      >
        Спробувати знову
      </button>
    </div>
  );
}

/** uk plural for "товар" (1 товар / 2-4 товари / 5+ товарів). */
function pluralProducts(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "товар";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "товари";
  return "товарів";
}
