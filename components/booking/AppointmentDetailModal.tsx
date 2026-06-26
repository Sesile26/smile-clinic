"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scroll-lock";
import { btnBase, btnGhost, btnMint } from "@/lib/buttons";
import { IcoClose } from "@/components/icons";
import { getBookedSlotDetail, BookingApiError } from "@/lib/booking-client";
import { confirmAppointment, rejectAppointment } from "@/lib/appointments-manage";
import { formatClinicDayLong, formatClinicTime } from "@/lib/clinic-time";
import type { BookedSlotDetail } from "@/lib/booking-types";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const STATUS_META: Record<
  BookedSlotDetail["status"],
  { label: string; badge: string; dot: string }
> = {
  pending: {
    label: "Очікує підтвердження",
    badge: "border-amber-300 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  confirmed: {
    label: "Підтверджено",
    badge: "border-emerald-300 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
  },
  done: {
    label: "Завершено",
    badge: "border-navy-900/15 bg-navy-900/[0.06] text-navy-700",
    dot: "bg-navy-400",
  },
  cancelled: {
    label: "Скасовано",
    badge: "border-red-200 bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
};

/**
 * Details of a booked slot's appointment (manage view). Server-gated: the data
 * only loads for a caller allowed to manage this slot's doctor. Offers the
 * status-appropriate action (confirm/reject for pending, cancel for confirmed)
 * and a link to the patient's profile.
 *
 * `canViewPatient` gates the "Профіль пацієнта" link — true for staff/admin/
 * doctor (everyone who can open this modal), but the destination re-checks
 * ownership, so a doctor only ever reaches their own patient.
 */
export function AppointmentDetailModal({
  slotId,
  online,
  canViewPatient,
  onClose,
  onChanged,
}: {
  slotId: string;
  online: boolean;
  canViewPatient: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const [detail, setDetail] = useState<BookedSlotDetail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load the appointment detail for this slot.
  useEffect(() => {
    const ac = new AbortController();
    getBookedSlotDetail(slotId, ac.signal)
      .then((d) => {
        setDetail(d);
        setLoadState("ready");
      })
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setLoadState("error");
      });
    return () => ac.abort();
  }, [slotId]);

  // Scroll lock + autofocus + focus restore + Escape (mirrors the other modals).
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    lockBodyScroll();
    const t = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
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

  const runAction = async (fn: () => Promise<void>) => {
    if (busy || !online) return;
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      onChanged();
      onClose();
    } catch (err) {
      setActionError(
        err instanceof BookingApiError
          ? err.message
          : "Не вдалося виконати дію. Спробуйте ще раз.",
      );
      setBusy(false);
    }
  };

  const meta = detail ? STATUS_META[detail.status] : null;
  const dateLabel = detail
    ? `${formatClinicDayLong(detail.date)}, ${formatClinicTime(detail.date)}`
    : "";

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(10,22,40,0.55)] p-4 backdrop-blur-[6px] sm:p-6"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[440px] overflow-hidden rounded-2xl bg-white shadow-s3"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-5 py-4">
          <h2
            id={titleId}
            className="font-serif text-[20px] leading-none tracking-[-0.01em] text-navy-900"
          >
            Деталі запису
          </h2>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            aria-label="Закрити"
            className="grid h-9 w-9 place-items-center rounded-full text-navy-400 transition-colors hover:bg-cream hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
          >
            <IcoClose size={18} />
          </button>
        </div>

        <div className="px-5 py-5">
          {loadState === "loading" ? (
            <DetailSkeleton />
          ) : loadState === "error" || !detail || !meta ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              Не вдалося завантажити деталі запису.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-lg font-medium text-navy-900">
                    {detail.patientName}
                  </div>
                  <div className="mt-0.5 text-sm tabular-nums text-navy-400">
                    {detail.patientPhone ?? "Телефон не вказано"}
                  </div>
                </div>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                    meta.badge,
                  )}
                >
                  <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                  {meta.label}
                </span>
              </div>

              <dl className="mt-4 flex flex-col gap-2 border-t border-[color:var(--line)] pt-4 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-navy-400">Дата й час</dt>
                  <dd className="text-right font-medium tabular-nums text-navy-900">{dateLabel}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-navy-400">Лікар</dt>
                  <dd className="text-right text-navy-700">{detail.doctorName}</dd>
                </div>
              </dl>

              {canViewPatient && (
                <Link
                  href={`/admin/patients?patient=${encodeURIComponent(detail.patientId)}`}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 underline-offset-2 transition-colors hover:text-mint-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:rounded"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Профіль пацієнта
                </Link>
              )}

              {actionError && (
                <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {actionError}
                </p>
              )}

              {!online && (
                <p className="mt-4 text-xs text-navy-400">
                  Дії доступні лише онлайн.
                </p>
              )}

              {/* Status-appropriate actions. */}
              {detail.status === "pending" && (
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    disabled={busy || !online}
                    onClick={() => runAction(() => confirmAppointment(detail.appointmentId))}
                    className={cn(btnBase, btnMint, "flex-1 justify-center", (busy || !online) && "cursor-not-allowed opacity-60")}
                  >
                    Підтвердити
                  </button>
                  <button
                    type="button"
                    disabled={busy || !online}
                    onClick={() => runAction(() => rejectAppointment(detail.appointmentId))}
                    className={cn(btnBase, btnGhost, "flex-1 justify-center", (busy || !online) && "cursor-not-allowed opacity-60")}
                  >
                    Відхилити
                  </button>
                </div>
              )}
              {detail.status === "confirmed" && (
                <div className="mt-5">
                  <button
                    type="button"
                    disabled={busy || !online}
                    onClick={() => runAction(() => rejectAppointment(detail.appointmentId))}
                    className={cn(
                      "inline-flex w-full items-center justify-center rounded-full border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1",
                      (busy || !online) && "cursor-not-allowed opacity-60",
                    )}
                  >
                    Скасувати запис
                  </button>
                  <p className="mt-2 text-center text-xs text-navy-400">
                    Слот звільниться, пацієнт отримає сповіщення.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Завантаження деталей…</span>
      <div className="h-6 w-2/3 animate-pulse rounded bg-bone/60" />
      <div className="h-4 w-1/3 animate-pulse rounded bg-bone/50" />
      <div className="mt-2 h-px bg-[color:var(--line)]" />
      <div className="h-4 w-full animate-pulse rounded bg-bone/40" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-bone/40" />
      <div className="mt-2 h-10 w-full animate-pulse rounded-full bg-bone/50" />
    </div>
  );
}
