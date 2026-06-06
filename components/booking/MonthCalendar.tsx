"use client";

import { useCallback, useRef } from "react";
import { cn } from "@/lib/cn";
import { WEEKDAYS_SHORT, buildMonthGrid, dayKey, isSameDay } from "./data";

interface MonthCalendarProps {
  monthAnchor: Date;
  /** Free-slot count per local day key (dayKey) — from real data. */
  freeCountByDay: Record<string, number>;
  today: Date | null;
  /** Picking a day jumps the parent into the week view around that date. */
  onPickDay: (date: Date) => void;
}

/**
 * Month overview. Each day shows how many free slots the selected doctor has.
 * Read-only summary — picking a day drills into the week grid.
 */
export function MonthCalendar({
  monthAnchor,
  freeCountByDay,
  today,
  onPickDay,
}: MonthCalendarProps) {
  const cells = buildMonthGrid(monthAnchor);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Local midnight of "today" — a day is past if it ends before this.
  const todayMidnight = today
    ? new Date(today.getFullYear(), today.getMonth(), today.getDate())
    : null;

  const onKeyDown = useCallback(
    (index: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const delta =
        e.key === "ArrowRight"
          ? 1
          : e.key === "ArrowLeft"
            ? -1
            : e.key === "ArrowDown"
              ? 7
              : e.key === "ArrowUp"
                ? -7
                : 0;
      if (delta === 0) return;
      const next = index + delta;
      const el = cellRefs.current[next];
      if (el) {
        el.focus();
        e.preventDefault();
      }
    },
    [],
  );

  return (
    <div className="rounded-xl border border-[color:var(--line)] bg-white p-2 sm:p-3">
      <div
        role="grid"
        aria-label="Розклад на місяць"
        className="grid grid-cols-7 gap-1"
      >
        {WEEKDAYS_SHORT.map((d) => (
          <div
            key={d}
            role="columnheader"
            className="py-1.5 text-center text-[11px] font-medium text-navy-400"
          >
            {d}
          </div>
        ))}

        {cells.map((cell, i) => {
          const isToday = today ? isSameDay(cell.date, today) : false;
          const isPast = todayMidnight ? cell.date < todayMidnight : false;
          const free = cell.inMonth ? (freeCountByDay[dayKey(cell.date)] ?? 0) : 0;
          const hasFree = free > 0 && !isPast;

          return (
            <button
              key={cell.date.toISOString()}
              ref={(el) => {
                cellRefs.current[i] = el;
              }}
              type="button"
              role="gridcell"
              tabIndex={i === 0 ? 0 : -1}
              disabled={isPast}
              onKeyDown={onKeyDown(i)}
              onClick={() => onPickDay(cell.date)}
              aria-label={
                isPast
                  ? `${cell.date.getDate()} число — день уже минув`
                  : `${cell.date.getDate()} число, вільних слотів: ${free}`
              }
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border text-sm transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1",
                "disabled:cursor-not-allowed",
                isPast
                  ? "border-transparent bg-cream/40 text-navy-400/40"
                  : cell.inMonth
                    ? "border-[color:var(--line)] hover:border-navy-900"
                    : "border-transparent text-navy-400/40",
                isToday && "border-navy-900",
              )}
            >
              <span
                className={cn(
                  "grid h-6 w-6 place-items-center rounded-full tabular-nums",
                  isToday && "bg-navy-900 text-white",
                )}
              >
                {cell.date.getDate()}
              </span>
              {cell.inMonth && !isPast && (
                <span
                  className={cn(
                    "inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums",
                    hasFree
                      ? "bg-mint-100 text-mint-600"
                      : "text-navy-400/50",
                  )}
                >
                  {hasFree ? free : "—"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-3 px-1 text-xs text-navy-400">
        Число у мітці — кількість вільних слотів. Оберіть день, щоб перейти до
        розкладу на тиждень.
      </p>
    </div>
  );
}
