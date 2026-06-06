"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  WEEKDAYS_SHORT,
  isSameDay,
  type DaySlots,
  type SlotStatus,
} from "./data";
import { SlotButton, type SlotVariant } from "./SlotButton";

type Mode = "manage" | "book";

interface WeekCalendarProps {
  week: DaySlots[];
  mode: Mode;
  /** Read-only (offline): slots stay visible but can't be activated. */
  disabled?: boolean;
  today: Date | null;
  /** Mobile-only: which day's slot list is shown. */
  selectedDay: number;
  onSelectDay: (index: number) => void;
  onActivate: (dayIndex: number, time: string, status: SlotStatus) => void;
}

/** Which cells render an interactive button in each mode. */
function isFocusable(
  status: SlotStatus,
  mode: Mode,
  disabled?: boolean,
  past?: boolean,
): boolean {
  if (disabled || past) return false; // past cells are never actionable
  if (mode === "manage") return status !== "booked";
  return status === "working"; // book mode → only free slots
}

function variantFor(status: SlotStatus, mode: Mode): SlotVariant {
  if (mode === "manage") return status; // off | working | booked
  return "free"; // book mode renders only free slots as "free"
}

export function WeekCalendar({
  week,
  mode,
  disabled = false,
  today,
  selectedDay,
  onSelectDay,
  onActivate,
}: WeekCalendarProps) {
  const times = week[0]?.slots.map((s) => s.time) ?? [];
  const rows = times.length;
  const cols = 7;

  // ─── Desktop roving tabindex ──────────────────────────────────────────────
  // Only enabled buttons are registered; arrows skip over gaps (off/booked
  // cells in book mode, lunch, etc.) to the next focusable slot.
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const register = useCallback(
    (key: string) => (el: HTMLButtonElement | null) => {
      if (el) cellRefs.current.set(key, el);
      else cellRefs.current.delete(key);
    },
    [],
  );

  // First focusable cell — owns tabIndex 0 until the user moves focus.
  const firstFocusableKey = useMemo(() => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = week[c]?.slots[r];
        if (cell && isFocusable(cell.status, mode, disabled, cell.past)) {
          return `${r}-${c}`;
        }
      }
    }
    return null;
  }, [week, rows, mode, disabled]);

  const stepFocus = useCallback(
    (row: number, col: number, dr: number, dc: number): boolean => {
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < rows && c >= 0 && c < cols) {
        const el = cellRefs.current.get(`${r}-${c}`);
        if (el) {
          el.focus();
          return true;
        }
        r += dr;
        c += dc;
      }
      return false;
    },
    [rows, cols],
  );

  const onCellKeyDown = useCallback(
    (row: number, col: number) =>
      (e: React.KeyboardEvent<HTMLButtonElement>) => {
        let moved = false;
        switch (e.key) {
          case "ArrowRight":
            moved = stepFocus(row, col, 0, 1);
            break;
          case "ArrowLeft":
            moved = stepFocus(row, col, 0, -1);
            break;
          case "ArrowDown":
            moved = stepFocus(row, col, 1, 0);
            break;
          case "ArrowUp":
            moved = stepFocus(row, col, -1, 0);
            break;
          case "Home":
            moved = cellRefs.current.get(`${row}-${col}`)
              ? stepFocus(row, -1, 0, 1) // first focusable in row
              : false;
            break;
          case "End":
            moved = stepFocus(row, cols, 0, -1); // last focusable in row
            break;
          default:
            return;
        }
        if (moved) e.preventDefault();
      },
    [stepFocus, cols],
  );

  const activeOrFirst = activeKey ?? firstFocusableKey;

  return (
    <div>
      {/* ─── Desktop: dense 7-day grid ─────────────────────────────────────── */}
      <div className="hidden md:block">
        <div
          role="grid"
          aria-label="Розклад на тиждень"
          aria-readonly={disabled || undefined}
          className="overflow-hidden rounded-xl border border-[color:var(--line)] bg-white"
        >
          {/* Header row */}
          <div
            role="row"
            className="grid border-b border-[color:var(--line)] bg-cream/60"
            style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}
          >
            <span role="columnheader" className="px-2 py-2.5" aria-hidden="true" />
            {week.map((day, c) => {
              const isToday = today ? isSameDay(day.date, today) : false;
              return (
                <span
                  role="columnheader"
                  key={day.date.toISOString()}
                  className={cn(
                    "px-2 py-2.5 text-center text-xs font-medium",
                    isToday ? "text-mint-600" : "text-navy-700",
                  )}
                >
                  <span className="block">{WEEKDAYS_SHORT[c]}</span>
                  <span
                    className={cn(
                      "mt-0.5 inline-grid h-6 w-6 place-items-center rounded-full text-[13px] tabular-nums",
                      isToday && "bg-navy-900 text-white",
                    )}
                  >
                    {day.date.getDate()}
                  </span>
                </span>
              );
            })}
          </div>

          {/* Time rows */}
          <div className="max-h-[560px] overflow-y-auto">
            {times.map((time, r) => (
              <div
                role="row"
                key={time}
                className="grid border-b border-[color:var(--line)] last:border-b-0"
                style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}
              >
                <span
                  role="rowheader"
                  className="flex items-center justify-center px-1 py-1.5 text-[11px] font-medium tabular-nums text-navy-400"
                >
                  {time}
                </span>
                {week.map((day, c) => {
                  const slot = day.slots[r];
                  const key = `${r}-${c}`;
                  const focusable = isFocusable(
                    slot.status,
                    mode,
                    disabled,
                    slot.past,
                  );
                  // Manage: show every cell (past ones greyed). Book: only a
                  // FREE, non-past slot is shown — past free slots are hidden.
                  const show =
                    mode === "manage" ||
                    (slot.status === "working" && !slot.past);

                  return (
                    <div
                      role="gridcell"
                      key={day.date.toISOString()}
                      className="p-1"
                    >
                      {show ? (
                        <SlotButton
                          ref={register(key)}
                          time={time}
                          variant={variantFor(slot.status, mode)}
                          past={slot.past}
                          disabled={disabled || slot.status === "booked"}
                          tabIndex={
                            focusable && key === activeOrFirst ? 0 : -1
                          }
                          onClick={() => onActivate(c, time, slot.status)}
                          onKeyDown={onCellKeyDown(r, c)}
                          onFocusCapture={
                            focusable ? () => setActiveKey(key) : undefined
                          }
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex h-[34px] items-center justify-center text-xs text-navy-400/30"
                        >
                          —
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Mobile: day tabs + single-day list ────────────────────────────── */}
      <div className="md:hidden">
        <div
          role="tablist"
          aria-label="Оберіть день"
          className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1"
        >
          {week.map((day, i) => {
            const isToday = today ? isSameDay(day.date, today) : false;
            const active = i === selectedDay;
            return (
              <button
                key={day.date.toISOString()}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectDay(i)}
                className={cn(
                  "flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1",
                  active
                    ? "border-navy-900 bg-navy-900 text-white"
                    : "border-[color:var(--line-2)] bg-white text-navy-700",
                )}
              >
                <span className="text-[11px] font-medium">
                  {WEEKDAYS_SHORT[i]}
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {day.date.getDate()}
                </span>
                {isToday && !active && (
                  <span className="mt-0.5 h-1 w-1 rounded-full bg-mint" />
                )}
              </button>
            );
          })}
        </div>

        <MobileDayList
          day={week[selectedDay]}
          mode={mode}
          disabled={disabled}
          onActivate={(time, status) => onActivate(selectedDay, time, status)}
        />
      </div>
    </div>
  );
}

function MobileDayList({
  day,
  mode,
  disabled,
  onActivate,
}: {
  day: DaySlots | undefined;
  mode: Mode;
  disabled?: boolean;
  onActivate: (time: string, status: SlotStatus) => void;
}) {
  if (!day) return null;

  const visible =
    mode === "manage"
      ? day.slots // past cells shown greyed/disabled
      : day.slots.filter((s) => s.status === "working" && !s.past); // hide past

  if (visible.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[color:var(--line-2)] bg-white px-4 py-8 text-center text-sm text-navy-400">
        Немає вільних слотів цього дня
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group">
      {visible.map((slot) => (
        <SlotButton
          key={slot.time}
          time={slot.time}
          variant={variantFor(slot.status, mode)}
          past={slot.past}
          disabled={disabled || slot.status === "booked"}
          onClick={() => onActivate(slot.time, slot.status)}
        />
      ))}
    </div>
  );
}
