"use client";

import { cn } from "@/lib/cn";
import { IcoChevron } from "@/components/icons";
import type { SlotDuration, ViewMode } from "./data";

interface CalendarToolbarProps {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  title: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Duration control is doctor-only; omit for the patient view. */
  duration?: SlotDuration;
  onDurationChange?: (d: SlotDuration) => void;
}

const DURATIONS: SlotDuration[] = [15, 30, 60];

export function CalendarToolbar({
  view,
  onViewChange,
  title,
  onPrev,
  onNext,
  onToday,
  duration,
  onDurationChange,
}: CalendarToolbarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      {/* Navigation + current range */}
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-full border border-[color:var(--line-2)] bg-white">
          <button
            type="button"
            onClick={onPrev}
            aria-label="Попередній період"
            className="grid h-9 w-9 place-items-center rounded-full text-navy-700 transition-colors hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
          >
            <IcoChevron size={18} className="rotate-90" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Наступний період"
            className="grid h-9 w-9 place-items-center rounded-full text-navy-700 transition-colors hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
          >
            <IcoChevron size={18} className="-rotate-90" />
          </button>
        </div>
        <button
          type="button"
          onClick={onToday}
          className="rounded-full border border-[color:var(--line-2)] bg-white px-3.5 py-2 text-[13px] font-medium text-navy-900 transition-colors hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
        >
          Сьогодні
        </button>
        <span className="ml-1 text-sm font-medium capitalize text-navy-900">
          {title}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Duration control (doctor only) */}
        {duration !== undefined && onDurationChange && (
          <div
            role="group"
            aria-label="Тривалість слота"
            className="flex items-center rounded-full bg-cream p-1"
          >
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={d === duration}
                onClick={() => onDurationChange(d)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                  d === duration
                    ? "bg-white text-navy-900 shadow-[0_2px_8px_rgba(10,22,40,0.08)]"
                    : "text-navy-400 hover:text-navy-900",
                )}
              >
                {d} хв
              </button>
            ))}
          </div>
        )}

        {/* Week / Month switch */}
        <div
          role="group"
          aria-label="Вид календаря"
          className="flex items-center rounded-full bg-cream p-1"
        >
          {(["week", "month"] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={v === view}
              onClick={() => onViewChange(v)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                v === view
                  ? "bg-white text-navy-900 shadow-[0_2px_8px_rgba(10,22,40,0.08)]"
                  : "text-navy-400 hover:text-navy-900",
              )}
            >
              {v === "week" ? "Тиждень" : "Місяць"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
