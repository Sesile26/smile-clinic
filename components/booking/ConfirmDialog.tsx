"use client";

import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scroll-lock";
import { btnBase, btnGhost, btnMint } from "@/lib/buttons";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Small accessible confirm dialog (focus-trapped, Escape/backdrop to cancel)
 * for the calendar's "Заповнити день" action.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Підтвердити",
  cancelLabel = "Скасувати",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    lockBodyScroll();
    const t = window.setTimeout(() => {
      ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }, 50);
    return () => {
      window.clearTimeout(t);
      unlockBodyScroll();
      prev?.focus?.();
    };
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const list = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
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
    [onCancel],
  );

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[110] grid place-items-center bg-[rgba(10,22,40,0.55)] p-5 backdrop-blur-[10px]"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmDialogTitle"
        aria-describedby="confirmDialogBody"
        className="w-full max-w-[400px] rounded-2xl bg-white p-6 shadow-s3"
      >
        <h2
          id="confirmDialogTitle"
          className="font-serif text-[22px] leading-tight tracking-[-0.01em] text-navy-900"
        >
          {title}
        </h2>
        <p id="confirmDialogBody" className="mt-2 text-sm text-navy-700">
          {message}
        </p>
        <div className="mt-5 flex gap-2.5 sm:flex-row-reverse">
          <button
            type="button"
            data-autofocus
            onClick={onConfirm}
            className={cn(btnBase, btnMint, "flex-1 justify-center")}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className={cn(btnBase, btnGhost, "flex-1 justify-center")}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
