"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { btnBase, btnMint } from "@/lib/buttons";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineNotice } from "@/components/shop/StatePanels";
import type { ApiSpecialty } from "@/lib/specialties";
import { useSpecialties } from "./useSpecialties";
import { NO_SPECIALTY_LABEL, pluralDoctors } from "./data";

const fieldInput =
  "w-full rounded-lg border border-[color:var(--line-2)] bg-white py-2.5 px-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]";
const fieldError = "text-xs text-red-500";

/**
 * Manage the doctor specialty directory. Same pattern as /admin/categories
 * (CategoriesPanel) — the same kind of reference directory — backed by
 * /api/specialties via useSpecialties. Add with validation, inline rename,
 * delete with confirmation (a non-empty specialty moves its doctors to
 * "Без спеціальності"). Offline → read-only with a banner (mutations are
 * online-only, no offline queue). States loading/empty/error like Categories.
 */
export function SpecialtiesPanel() {
  const { isOnline: online } = useOnlineStatus();
  const specs = useSpecialties();

  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !online) return;
    setBusy(true);
    const res = await specs.add(newName);
    setBusy(false);
    if (res.ok) {
      setNewName("");
      setAddError(null);
    } else {
      setAddError(res.error ?? "Не вдалося додати");
    }
  };

  const startEdit = (s: ApiSpecialty) => {
    setConfirmId(null);
    setRemoveError(null);
    setEditingId(s.id);
    setEditName(s.name);
    setEditError(null);
  };
  const submitEdit = async (id: string) => {
    if (busy || !online) return;
    setBusy(true);
    const res = await specs.rename(id, editName);
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
    const res = await specs.remove(id);
    setBusy(false);
    if (res.ok) {
      setConfirmId(null);
      setRemoveError(null);
    } else {
      setRemoveError(res.error ?? "Не вдалося видалити");
    }
  };

  return (
    <div className="max-w-[520px]">
      {!online && (
        <OfflineNotice
          className="mb-4"
          message="Ви офлайн. Спеціальності показано лише для перегляду — зміни доступні лише онлайн."
        />
      )}

      {/* Add */}
      <form onSubmit={submitAdd} noValidate className="mb-4 flex flex-col gap-1.5">
        <label htmlFor="spec-new" className="sr-only">Нова спеціальність</label>
        <div className="flex gap-2">
          <input
            id="spec-new"
            type="text"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (addError) setAddError(null);
            }}
            placeholder="Нова спеціальність…"
            className={fieldInput}
            aria-invalid={!!addError}
            aria-describedby={addError ? "spec-new-error" : undefined}
          />
          <button
            type="submit"
            disabled={specs.state !== "ready" || busy || !online || !newName.trim()}
            className={cn(btnBase, btnMint, "shrink-0 justify-center px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50")}
          >
            Додати
          </button>
        </div>
        {addError && (
          <span id="spec-new-error" className={fieldError} role="alert">{addError}</span>
        )}
      </form>

      {/* List / states */}
      {specs.state === "loading" ? (
        <SkeletonRows />
      ) : specs.state === "error" ? (
        <ErrorPanel onRetry={specs.reload} />
      ) : specs.specialties.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[color:var(--line-2)] bg-cream/40 px-4 py-8 text-center text-sm text-navy-400">
          Ще немає спеціальностей. Додайте першу полем вище.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[color:var(--line)] rounded-lg border border-[color:var(--line)] bg-white">
          {specs.specialties.map((s) => (
            <li key={s.id} className="px-3.5 py-2.5">
              {editingId === s.id ? (
                <InlineEdit
                  value={editName}
                  error={editError}
                  onChange={(v) => {
                    setEditName(v);
                    if (editError) setEditError(null);
                  }}
                  onSave={() => submitEdit(s.id)}
                  onCancel={() => {
                    setEditingId(null);
                    setEditError(null);
                  }}
                />
              ) : confirmId === s.id ? (
                <DeleteConfirm
                  count={s.doctorCount}
                  busy={busy}
                  error={removeError}
                  onConfirm={() => confirmRemove(s.id)}
                  onCancel={() => {
                    setConfirmId(null);
                    setRemoveError(null);
                  }}
                />
              ) : (
                <Row
                  specialty={s}
                  disabled={!online}
                  onEdit={() => startEdit(s)}
                  onDelete={() => {
                    setEditingId(null);
                    setRemoveError(null);
                    setConfirmId(s.id);
                  }}
                />
              )}
            </li>
          ))}
          {specs.unassignedCount > 0 && (
            <li className="flex items-center justify-between gap-3 bg-cream/40 px-3.5 py-2.5">
              <span className="text-sm italic text-navy-400">{NO_SPECIALTY_LABEL}</span>
              <CountBadge count={specs.unassignedCount} muted />
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ─── Pieces (той самий патерн, що CategoriesPanel) ────────────────────────────

function Row({
  specialty,
  disabled,
  onEdit,
  onDelete,
}: {
  specialty: ApiSpecialty;
  disabled?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="truncate text-sm font-medium text-navy-900">{specialty.name}</span>
        <CountBadge count={specialty.doctorCount} />
      </div>
      <div className="flex shrink-0 gap-1">
        <IconBtn label={`Перейменувати «${specialty.name}»`} onClick={onEdit} disabled={disabled} path="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        <IconBtn label={`Видалити «${specialty.name}»`} onClick={onDelete} danger disabled={disabled} path="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      </div>
    </div>
  );
}

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
          aria-label="Нова назва спеціальності"
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
      {error && <span className={fieldError} role="alert">{error}</span>}
    </div>
  );
}

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
  const hasDoctors = count > 0;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-navy-700">
        {hasDoctors ? (
          <>
            У спеціальності <span className="font-medium">{count}</span>{" "}
            {pluralDoctors(count)}. Видалити та перенести їх у «{NO_SPECIALTY_LABEL}»?
          </>
        ) : (
          "Видалити цю спеціальність?"
        )}
      </p>
      {error && <span className={fieldError} role="alert">{error}</span>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
        >
          {hasDoctors ? `Перенести в «${NO_SPECIALTY_LABEL}»` : "Видалити"}
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

function CountBadge({ count, muted }: { count: number; muted?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        muted ? "bg-navy-900/[0.06] text-navy-400" : "bg-cream text-navy-700",
      )}
    >
      {count} {pluralDoctors(count)}
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
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      className="flex flex-col divide-y divide-[color:var(--line)] rounded-lg border border-[color:var(--line)] bg-white"
    >
      <span className="sr-only">Завантаження спеціальностей…</span>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-3.5 py-3">
          <div className="h-4 w-36 animate-pulse rounded bg-bone/60" />
          <div className="h-6 w-16 animate-pulse rounded-full bg-bone/50" />
        </div>
      ))}
    </div>
  );
}

function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-4">
      <p className="text-sm font-medium text-red-800">Не вдалося завантажити спеціальності.</p>
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
