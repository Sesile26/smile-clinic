"use client";

import { cn } from "@/lib/cn";
import { IcoClock } from "@/components/icons";
import {
  CLINIC_ADDRESS,
  STATUS_META,
  formatDate,
  formatDayLong,
  formatTime,
  type Appointment,
} from "./data";

interface AppointmentCardProps {
  appointment: Appointment;
  variant: "upcoming" | "past";
  /** Offline → cancel disabled. Upcoming only. */
  online?: boolean;
  onCancel?: (id: string) => void;
}

export function AppointmentCard({
  appointment: a,
  variant,
  online = true,
  onCancel,
}: AppointmentCardProps) {
  const meta = STATUS_META[a.status];
  const isUpcoming = variant === "upcoming";

  return (
    <article
      className={cn(
        "rounded-xl border bg-white p-4 sm:p-5",
        isUpcoming
          ? "border-[color:var(--line-2)]"
          : "border-[color:var(--line)] opacity-[0.92]",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {/* Date/time — prominent for upcoming, plain for past */}
          {isUpcoming ? (
            <div className="mb-1 flex items-baseline gap-2">
              <span className="font-serif text-[22px] leading-none tracking-[-0.01em] text-navy-900">
                {formatTime(a.date)}
              </span>
              <span className="text-sm font-medium capitalize text-navy-700">
                {formatDayLong(a.date)}
              </span>
            </div>
          ) : (
            <div className="mb-1 text-sm font-medium text-navy-700">
              {formatDate(a.date)} · {formatTime(a.date)}
            </div>
          )}

          <div className="text-sm text-navy-900">
            <span className="font-medium">{a.doctorName}</span>
            <span className="text-navy-400"> · {a.doctorSpecialty}</span>
          </div>

          {isUpcoming && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-navy-400">
              <IcoClock size={13} className="shrink-0 text-mint-600" />
              {CLINIC_ADDRESS}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
              meta.badge,
            )}
          >
            {meta.label}
          </span>

          {isUpcoming && onCancel && (
            <button
              type="button"
              onClick={() => onCancel(a.id)}
              disabled={!online}
              title={!online ? "Скасування доступне лише онлайн" : undefined}
              className={cn(
                "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "border-[color:var(--line-2)] text-navy-900 hover:border-red-300 hover:bg-red-50 hover:text-red-600",
              )}
            >
              Скасувати запис
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
