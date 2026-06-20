"use client";

import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scroll-lock";
import { btnBase, btnGhost } from "@/lib/buttons";
import { IcoClose } from "@/components/icons";
import {
  STATUS_META,
  formatDayLong,
  formatTime,
  type Appointment,
} from "./data";

interface CancelModalProps {
  appointment: Appointment | null;
  /** Cancel request in flight — disables the actions. */
  submitting?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Confirm-cancel dialog. Mounted only while an appointment is selected (keyed by
 * id in the parent). a11y mirrors ConfirmModal: role=dialog + aria-modal, scroll
 * lock, Escape, focus trap, focus restore. MOCK ONLY — onConfirm flips local
 * state; the real DELETE /api/bookings call is wired during integration.
 */
export function CancelModal({
  appointment,
  submitting = false,
  onConfirm,
  onClose,
}: CancelModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    lockBodyScroll();
    const t = window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>("[data-autofocus]")
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

  if (!appointment) return null;
  const a = appointment;

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(10,22,40,0.55)] p-5 backdrop-blur-[10px]"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancelTitle"
        className="relative w-full max-w-[440px] overflow-hidden rounded-2xl bg-white p-7 shadow-s3 max-[480px]:p-6"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрити"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-navy-400 transition-colors hover:bg-cream hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
        >
          <IcoClose size={18} />
        </button>

        <h2
          id="cancelTitle"
          className="mb-1.5 font-serif text-[24px] leading-tight tracking-[-0.015em] text-navy-900"
        >
          Скасувати запис?
        </h2>
        <p className="mb-5 text-sm text-navy-400">
          Цю дію не можна скасувати. За потреби запишіться знову у зручний час.
        </p>

        <dl className="mb-6 divide-y divide-[color:var(--line)] rounded-xl border border-[color:var(--line)] bg-cream/40">
          <Row term="Лікар" value={a.doctorSpecialty ? `${a.doctorName} · ${a.doctorSpecialty}` : a.doctorName} />
          <Row term="Дата" value={formatDayLong(a.date)} />
          <Row term="Час" value={formatTime(a.date)} />
          <Row term="Статус" value={STATUS_META[a.status].label} />
        </dl>

        <div className="flex flex-col gap-2.5 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className={cn(
              btnBase,
              "flex-1 justify-center bg-red-600 text-white hover:bg-red-700",
              submitting && "opacity-70",
            )}
          >
            {submitting ? "Скасовуємо…" : "Так, скасувати"}
          </button>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            disabled={submitting}
            className={cn(btnBase, btnGhost, "flex-1 justify-center")}
          >
            Залишити запис
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-[13px] text-navy-400">{term}</dt>
      <dd className="text-right text-sm font-medium text-navy-900">{value}</dd>
    </div>
  );
}
