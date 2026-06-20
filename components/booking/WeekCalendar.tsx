"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  WEEKDAYS_SHORT,
  dayKey,
  isSameDay,
  type DaySlots,
  type SlotStatus,
} from "./data";

/** A cell to briefly highlight (the "next free time" jump target). */
export interface SlotHighlight {
  dateKey: string;
  time: string;
}
import { SlotButton, type SlotVariant } from "./SlotButton";

type Mode = "manage" | "book";

/** What the SLOT ZONE shows. The day-header row / mobile tabs (the dates) and
 *  the surrounding frame always render — only this inner zone swaps, so the
 *  header never disappears between loading / empty / slots. */
export type WeekBodyState = "ready" | "loading" | "empty" | "error";

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
  /** Manage-only: fill all empty working hours of a day (per-day button). */
  onFillDay?: (dayIndex: number) => void;
  /** Inner slot-zone state (default "ready" → current slots). The header/frame
   *  stay put for every value, so switching weeks never drops the dates. */
  bodyState?: WeekBodyState;
  /** Fade the loading shimmer in (anti-flicker delay) — only for "loading". */
  cellsVisible?: boolean;
  /** Copy for the "empty" zone. */
  emptyTitle?: string;
  emptyHint?: string;
  /** Retry for the "error" zone. */
  onRetry?: () => void;
  /** Cell to flash + scroll into view (e.g. the "next free time" target). */
  highlight?: SlotHighlight | null;
  /** Manage: make BOOKED (non-past) cells clickable to open appointment
   *  details (instead of being inert). off/working toggling is unchanged. */
  bookedActionable?: boolean;
}

const SKELETON_ROWS = 8;

/** Which cells render an interactive button in each mode. */
function isFocusable(
  status: SlotStatus,
  mode: Mode,
  disabled?: boolean,
  past?: boolean,
  bookedActionable?: boolean,
): boolean {
  if (disabled || past) return false; // past cells are never actionable
  if (mode === "manage") return status !== "booked" || !!bookedActionable;
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
  onFillDay,
  bodyState = "ready",
  cellsVisible = false,
  emptyTitle = "Немає вільних місць",
  emptyHint,
  onRetry,
  highlight = null,
  bookedActionable = false,
}: WeekCalendarProps) {
  // Scroll the flashed cell into view when a highlight target appears (the
  // visible one — desktop grid or mobile list, whichever is on screen).
  useEffect(() => {
    if (!highlight) return;
    const els = Array.from(
      document.querySelectorAll<HTMLElement>('[data-slot-highlight="true"]'),
    );
    const visible = els.find((el) => el.offsetParent !== null);
    visible?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight]);
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
        if (
          cell &&
          isFocusable(cell.status, mode, disabled, cell.past, bookedActionable)
        ) {
          return `${r}-${c}`;
        }
      }
    }
    return null;
  }, [week, rows, mode, disabled, bookedActionable]);

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
                  {mode === "manage" && onFillDay && !disabled && (
                    <button
                      type="button"
                      onClick={() => onFillDay(c)}
                      aria-label={`Заповнити день ${day.date.getDate()}.${day.date.getMonth() + 1} вільними слотами`}
                      title="Заповнити день вільними слотами"
                      className="mt-1 block w-full rounded-md border border-[color:var(--line-2)] bg-white px-1 py-0.5 text-[10px] font-medium text-navy-700 transition-colors hover:border-mint hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
                    >
                      Заповнити
                    </button>
                  )}
                </span>
              );
            })}
          </div>

          {/* Slot zone — swaps content; the header above stays put. Stable
              min-height so loading → empty/slots doesn't jump vertically. */}
          <div className="min-h-[336px]">
            {bodyState !== "ready" ? (
              <DesktopZoneState
                state={bodyState}
                cellsVisible={cellsVisible}
                emptyTitle={emptyTitle}
                emptyHint={emptyHint}
                onRetry={onRetry}
              />
            ) : (
            times.map((time, r) => (
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
                    bookedActionable,
                  );
                  // A booked cell is clickable (to open details) only when the
                  // manage popup is enabled and it isn't past.
                  const bookedClickable =
                    slot.status === "booked" && bookedActionable && !slot.past;
                  // Manage: show every cell (past ones greyed). Book: only a
                  // FREE, non-past slot is shown — past free slots are hidden.
                  const show =
                    mode === "manage" ||
                    (slot.status === "working" && !slot.past);
                  const isHl =
                    !!highlight &&
                    time === highlight.time &&
                    dayKey(day.date) === highlight.dateKey;

                  return (
                    <div
                      role="gridcell"
                      key={day.date.toISOString()}
                      className="p-0.5"
                      data-slot-highlight={isHl ? "true" : undefined}
                    >
                      {show ? (
                        <SlotButton
                          ref={register(key)}
                          time={time}
                          variant={variantFor(slot.status, mode)}
                          past={slot.past}
                          disabled={disabled}
                          actionable={bookedClickable}
                          tabIndex={
                            focusable && key === activeOrFirst ? 0 : -1
                          }
                          onClick={() => onActivate(c, time, slot.status)}
                          onKeyDown={onCellKeyDown(r, c)}
                          onFocusCapture={
                            focusable ? () => setActiveKey(key) : undefined
                          }
                          className={cn(
                            bookedClickable &&
                              "cursor-pointer hover:border-navy-900/40 hover:bg-navy-900/[0.1]",
                            isHl &&
                              "ring-2 ring-mint-600 ring-offset-1 animate-pulse",
                          )}
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
            ))
            )}
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

        {mode === "manage" && onFillDay && !disabled && week[selectedDay] && (
          <button
            type="button"
            onClick={() => onFillDay(selectedDay)}
            className="mb-3 w-full rounded-lg border border-[color:var(--line-2)] bg-white px-3 py-2 text-sm font-medium text-navy-700 transition-colors hover:border-mint hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
          >
            Заповнити день вільними слотами
          </button>
        )}

        <div className="min-h-[180px]">
          {bodyState !== "ready" ? (
            <MobileZoneState
              state={bodyState}
              cellsVisible={cellsVisible}
              emptyTitle={emptyTitle}
              emptyHint={emptyHint}
              onRetry={onRetry}
            />
          ) : (
            <MobileDayList
              day={week[selectedDay]}
              mode={mode}
              disabled={disabled}
              highlight={highlight}
              bookedActionable={bookedActionable}
              onActivate={(time, status) => onActivate(selectedDay, time, status)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MobileDayList({
  day,
  mode,
  disabled,
  highlight,
  bookedActionable,
  onActivate,
}: {
  day: DaySlots | undefined;
  mode: Mode;
  disabled?: boolean;
  highlight?: SlotHighlight | null;
  bookedActionable?: boolean;
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

  const hlTime =
    highlight && dayKey(day.date) === highlight.dateKey ? highlight.time : null;

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group">
      {visible.map((slot) => {
        const isHl = hlTime === slot.time;
        const bookedClickable =
          slot.status === "booked" && bookedActionable && !slot.past;
        return (
          <div
            key={slot.time}
            data-slot-highlight={isHl ? "true" : undefined}
            className={
              isHl
                ? "rounded-lg ring-2 ring-mint-600 ring-offset-1 animate-pulse"
                : undefined
            }
          >
            <SlotButton
              time={slot.time}
              variant={variantFor(slot.status, mode)}
              past={slot.past}
              disabled={disabled}
              actionable={bookedClickable}
              onClick={() => onActivate(slot.time, slot.status)}
              className={
                bookedClickable
                  ? "cursor-pointer hover:border-navy-900/40 hover:bg-navy-900/[0.1]"
                  : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Slot-zone states (shimmer / empty / error) ──────────────────────────────
// Rendered INSIDE the frame, below the day-header row, so the dates stay put.

function ZoneMessage({
  title,
  hint,
  onRetry,
  tone = "muted",
}: {
  title: string;
  hint?: string;
  onRetry?: () => void;
  tone?: "muted" | "error";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className="flex h-full min-h-[inherit] flex-col items-center justify-center px-6 py-12 text-center"
    >
      <p
        className={cn(
          "text-base font-medium",
          tone === "error" ? "text-red-800" : "text-navy-900",
        )}
      >
        {title}
      </p>
      {hint && <p className="mt-1 max-w-[40ch] text-sm text-navy-400">{hint}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
        >
          Спробувати знову
        </button>
      )}
    </div>
  );
}

const shimmerCell = (cellsVisible: boolean) =>
  cn(
    "h-[34px] rounded-lg bg-bone/60 transition-opacity duration-200",
    cellsVisible ? "animate-pulse opacity-100" : "opacity-0",
  );

function DesktopZoneState({
  state,
  cellsVisible,
  emptyTitle,
  emptyHint,
  onRetry,
}: {
  state: Exclude<WeekBodyState, "ready">;
  cellsVisible: boolean;
  emptyTitle: string;
  emptyHint?: string;
  onRetry?: () => void;
}) {
  if (state === "loading") {
    return (
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Завантаження слотів…</span>
        {Array.from({ length: SKELETON_ROWS }).map((_, r) => (
          <div
            key={r}
            className="grid border-b border-[color:var(--line)] last:border-b-0"
            style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}
          >
            <span className="flex items-center justify-center px-1 py-1.5">
              <span
                className={cn(
                  "h-3 w-9 rounded bg-bone/50 transition-opacity duration-200",
                  cellsVisible ? "animate-pulse opacity-100" : "opacity-0",
                )}
              />
            </span>
            {Array.from({ length: 7 }).map((_, c) => (
              <div key={c} className="p-0.5">
                <div className={shimmerCell(cellsVisible)} />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <ZoneMessage
      title={state === "error" ? "Не вдалося завантажити слоти" : emptyTitle}
      hint={state === "error" ? undefined : emptyHint}
      onRetry={state === "error" ? onRetry : undefined}
      tone={state === "error" ? "error" : "muted"}
    />
  );
}

function MobileZoneState({
  state,
  cellsVisible,
  emptyTitle,
  emptyHint,
  onRetry,
}: {
  state: Exclude<WeekBodyState, "ready">;
  cellsVisible: boolean;
  emptyTitle: string;
  emptyHint?: string;
  onRetry?: () => void;
}) {
  if (state === "loading") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="grid grid-cols-3 gap-2 sm:grid-cols-4"
      >
        <span className="sr-only">Завантаження слотів…</span>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className={shimmerCell(cellsVisible)} />
        ))}
      </div>
    );
  }
  return (
    <ZoneMessage
      title={state === "error" ? "Не вдалося завантажити слоти" : emptyTitle}
      hint={state === "error" ? undefined : emptyHint}
      onRetry={state === "error" ? onRetry : undefined}
      tone={state === "error" ? "error" : "muted"}
    />
  );
}
