"use client";

import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { btnBase, btnGhost, btnMint } from "@/lib/buttons";
import { IcoClose } from "@/components/icons";
import { formatDayLong, type Doctor } from "./data";

interface ConfirmModalProps {
  open: boolean;
  /** When true, render the "successfully booked" state instead of confirm. */
  success: boolean;
  doctor: Doctor | null;
  date: Date | null;
  time: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Booking confirmation dialog. Mirrors LoginModal's a11y contract: role=dialog
 * + aria-modal, scroll lock, Escape to close, focus trap, focus restore.
 * Purely visual — onConfirm just flips local mock state in the parent.
 */
export function ConfirmModal({
  open,
  success,
  doctor,
  date,
  time,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Scroll lock + autofocus + focus restore.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    const t = window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>("[data-autofocus]")
        ?.focus();
    }, 60);

    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, [open, success]);

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

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
      className={cn(
        "fixed inset-0 z-[100] grid place-items-center p-5 backdrop-blur-[10px] transition-[opacity,visibility] duration-300 ease-smooth",
        "bg-[rgba(10,22,40,0.55)]",
        open ? "visible opacity-100" : "invisible opacity-0",
      )}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmTitle"
        className={cn(
          "relative w-full max-w-[460px] overflow-hidden rounded-2xl bg-white p-7 shadow-s3 transition-transform duration-[400ms] ease-smooth max-[480px]:p-6",
          open ? "translate-y-0 scale-100" : "translate-y-4 scale-[0.98]",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрити"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-navy-400 transition-colors hover:bg-cream hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
        >
          <IcoClose size={18} />
        </button>

        {success ? (
          <div className="text-center">
            <span
              aria-hidden="true"
              className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-mint-100 text-mint-600"
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <h3
              id="confirmTitle"
              className="mb-2 font-serif text-[26px] leading-tight tracking-[-0.015em] text-navy-900"
            >
              Успішно <em className="italic text-mint-600">заброньовано</em>!
            </h3>
            <p className="mx-auto mb-6 max-w-[34ch] text-sm text-navy-400">
              {doctor && date && time ? (
                <>
                  Ваш візит до {doctor.name} —{" "}
                  <span className="font-medium text-navy-900">
                    {formatDayLong(date)} о {time}
                  </span>
                  . Це демо: реальний запис не створено.
                </>
              ) : (
                "Це демонстрація — реальний запис не створено."
              )}
            </p>
            <button
              type="button"
              data-autofocus
              onClick={onClose}
              className={cn(btnBase, btnMint, "w-full justify-center")}
            >
              Готово
            </button>
          </div>
        ) : (
          <>
            <h3
              id="confirmTitle"
              className="mb-1.5 font-serif text-[26px] leading-tight tracking-[-0.015em] text-navy-900"
            >
              Підтвердження запису
            </h3>
            <p className="mb-5 text-sm text-navy-400">
              Перевірте деталі візиту перед бронюванням.
            </p>

            <dl className="mb-6 divide-y divide-[color:var(--line)] rounded-xl border border-[color:var(--line)] bg-cream/40">
              <Row term="Лікар" value={doctor?.name ?? "—"} />
              <Row term="Спеціальність" value={doctor?.specialty ?? "—"} />
              <Row term="Дата" value={date ? formatDayLong(date) : "—"} />
              <Row term="Час" value={time ?? "—"} />
            </dl>

            <div className="flex flex-col gap-2.5 sm:flex-row-reverse">
              <button
                type="button"
                data-autofocus
                onClick={onConfirm}
                className={cn(btnBase, btnMint, "flex-1 justify-center")}
              >
                Підтвердити запис
              </button>
              <button
                type="button"
                onClick={onClose}
                className={cn(btnBase, btnGhost, "flex-1 justify-center")}
              >
                Скасувати
              </button>
            </div>
          </>
        )}
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
