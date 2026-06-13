/**
 * UI helpers for the /booking calendar.
 *
 * The mock data generator is GONE — slots now come from the API / Dexie mirror
 * (see hooks/useBooking.ts). This module keeps the pure, presentational bits:
 * date math, uk-locale formatting, and helpers that fold a list of real
 * {@link ApiSlot}s into the grid shape the calendar components render.
 *
 * TZ: slots arrive as UTC ISO; everything here works in LOCAL time via the
 * conversion helpers in lib/booking-time.ts. Single source of truth = UTC.
 */

import {
  buildTimes,
  cellKey,
  utcToLocalCell,
  type SlotDuration,
} from "@/lib/booking-time";
import type { ApiSlot } from "@/lib/booking-types";

export type { SlotDuration } from "@/lib/booking-time";
export { buildTimes } from "@/lib/booking-time";

export type ViewMode = "week" | "month";

/**
 * Grid vocabulary (decoupled from the API's free/booked):
 *  - "off"     — no slot exists for this cell (manage: toggle on to create)
 *  - "working" — a free slot exists (manage: toggle off to delete · patient:
 *                bookable)
 *  - "booked"  — slot has an appointment; locked
 */
export type SlotStatus = "off" | "working" | "booked";

/** Minimal doctor shape used across the booking UI (matches ApiDoctor). */
export interface Doctor {
  id: string;
  name: string;
  specialtyId: string | null;
  specialtyName: string | null;
}

export interface DaySlots {
  date: Date;
  slots: { time: string; status: SlotStatus; past: boolean }[];
}

/**
 * Is the local cell (date + "HH:MM") strictly before `now`? Comparison is by
 * MOMENT (epoch ms), so a slot earlier today counts as past in the evening.
 * TZ-safe: a local Date and `now` are both absolute instants.
 */
export function isCellPast(date: Date, time: string, now: Date): boolean {
  const [h, m] = time.split(":").map(Number);
  const cellMs = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    h,
    m,
  ).getTime();
  return cellMs < now.getTime();
}

// ─── Date helpers (uk locale, hardcoded to avoid Intl drift) ─────────────────

export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

const MONTHS_NOM = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

const MONTHS_GEN = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
];

/** Monday-based start of the week containing `d`, at local midnight. */
export function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  return x;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Local "YYYY-MM-DD" key. Same format as lib/booking-time.localDateKey. */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const a = `${weekStart.getDate()} ${MONTHS_GEN[weekStart.getMonth()]}`;
  const b = `${end.getDate()} ${MONTHS_GEN[end.getMonth()]}`;
  return `${a} — ${b}`;
}

export function formatMonth(d: Date): string {
  return `${MONTHS_NOM[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDayLong(d: Date): string {
  const dow = WEEKDAYS_SHORT[(d.getDay() + 6) % 7];
  return `${dow}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

// ─── Folding real slots into the grid ────────────────────────────────────────

export interface SlotMaps {
  /** cellKey(dayKey,time) → grid status. */
  statusByCell: Map<string, SlotStatus>;
  /** cellKey(dayKey,time) → the underlying API slot (for actions). */
  slotByCell: Map<string, ApiSlot>;
}

/** Lookup key for a given calendar cell (local Date + "HH:MM"). */
export function cellKeyOf(date: Date, time: string): string {
  return cellKey(dayKey(date), time);
}

/** Index a flat slot list by local (day, time) for O(1) grid lookups. */
export function indexSlots(slots: ApiSlot[]): SlotMaps {
  const statusByCell = new Map<string, SlotStatus>();
  const slotByCell = new Map<string, ApiSlot>();
  for (const s of slots) {
    const { dateKey, time } = utcToLocalCell(s.startsAt);
    const key = cellKey(dateKey, time);
    // Managers receive free/booked; patients only ever get free (the API
    // withholds booked from them).
    const status: SlotStatus = s.status === "booked" ? "booked" : "working";
    statusByCell.set(key, status);
    slotByCell.set(key, s);
  }
  return { statusByCell, slotByCell };
}

/** Build a 7-day grid for `times`, reading statuses from the slot map. */
export function assembleWeek(
  weekStart: Date,
  times: string[],
  statusByCell: Map<string, SlotStatus>,
  now: Date,
): DaySlots[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dk = dayKey(date);
    return {
      date,
      slots: times.map((time) => ({
        time,
        status: statusByCell.get(cellKey(dk, time)) ?? "off",
        past: isCellPast(date, time, now),
      })),
    };
  });
}

/** Fixed working-window grid times for the doctor's chosen slot length. */
export function manageTimes(duration: SlotDuration): string[] {
  return buildTimes(duration);
}

/**
 * Patient grid times = the sorted set of local start-times that actually have a
 * FREE slot somewhere in the visible week. Adapts to whatever durations the
 * doctor created, instead of forcing a fixed grid.
 */
export function patientTimes(slots: ApiSlot[]): string[] {
  const set = new Set<string>();
  for (const s of slots) {
    if (s.status === "free") set.add(utcToLocalCell(s.startsAt).time);
  }
  return [...set].sort();
}

/** Per-local-day count of free slots — drives the month-view badges. */
export function freeCountByDay(slots: ApiSlot[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of slots) {
    if (s.status !== "free") continue;
    const { dateKey } = utcToLocalCell(s.startsAt);
    out[dateKey] = (out[dateKey] ?? 0) + 1;
  }
  return out;
}

// ─── Month grid ──────────────────────────────────────────────────────────────

export interface MonthCell {
  date: Date;
  inMonth: boolean;
}

/** Six Monday-based weeks covering the month of `anchor`. */
export function buildMonthGrid(anchor: Date): MonthCell[] {
  const first = startOfMonth(anchor);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(gridStart, i);
    return { date, inMonth: date.getMonth() === anchor.getMonth() };
  });
}
