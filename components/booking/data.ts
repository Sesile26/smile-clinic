/**
 * Mock data + pure helpers for the /booking UI.
 *
 * THIS IS A FRONTEND-ONLY STEP. There is no fetch, no API, no DB here — every
 * "slot" is derived deterministically from a tiny hash so the same doctor +
 * day + time always renders the same state across reloads (stable demo, no
 * hydration flicker). Real scheduling will replace these helpers later.
 */

export type ViewMode = "week" | "month";

/**
 * Demo-only switch so reviewers can preview every async UI state without a
 * server. "ready" is the normal happy path.
 */
export type DemoState = "ready" | "loading" | "empty" | "error";

/** Slot length the doctor works in. Affects how dense the grid is. */
export type SlotDuration = 15 | 30 | 60;

/**
 * Slot state from the *doctor's* point of view:
 *  - "off"     — doctor is not working this slot (toggleable on)
 *  - "working" — doctor marked themselves available (toggleable off) and it is
 *                what a patient sees as a free, bookable slot
 *  - "booked"  — an appointment already exists; locked, never toggleable
 */
export type SlotStatus = "off" | "working" | "booked";

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  /** Two-letter monogram for the avatar chip. */
  initials: string;
}

export interface DaySlots {
  /** Date for this column. */
  date: Date;
  slots: { time: string; status: SlotStatus }[];
}

// ─── Mock doctors ────────────────────────────────────────────────────────────

export const DOCTORS: Doctor[] = [
  { id: "d1", name: "Олена Коваль", specialty: "Естетична стоматологія", initials: "ОК" },
  { id: "d2", name: "Андрій Левченко", specialty: "Імплантація", initials: "АЛ" },
  { id: "d3", name: "Марія Гончар", specialty: "Ортодонтія", initials: "МГ" },
  { id: "d4", name: "Ігор Дідух", specialty: "Дитяча стоматологія", initials: "ІД" },
  { id: "d5", name: "Софія Тарасенко", specialty: "Невідкладна допомога", initials: "СТ" },
];

/** Unique specialties, in declaration order — for the patient-side filter. */
export const SPECIALTIES: string[] = Array.from(
  new Set(DOCTORS.map((d) => d.specialty)),
);

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

/** Monday-based start of the week containing `d`, normalised to local midnight. */
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

/** Stable "YYYY-MM-DD" key (local), used both for React keys and the hash. */
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

// ─── Deterministic mock slot generation ──────────────────────────────────────

/** FNV-1a-ish hash → unsigned 32-bit, stable across reloads/SSR. */
function hash(...parts: (string | number)[]): number {
  let h = 2166136261;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const WORK_START_MIN = 9 * 60; // 09:00
const WORK_END_MIN = 18 * 60; // 18:00

function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Time labels for a given slot duration, 09:00 → 18:00. */
export function buildTimes(duration: SlotDuration): string[] {
  const out: string[] = [];
  for (let m = WORK_START_MIN; m < WORK_END_MIN; m += duration) {
    out.push(fmtTime(m));
  }
  return out;
}

/**
 * Base (un-edited) status for one slot. Deterministic per doctor/day/time so
 * the demo is stable. Sunday is closed; 13:00 is lunch; Saturdays are light.
 */
function baseStatus(
  doctorId: string,
  date: Date,
  time: string,
): SlotStatus {
  const dow = (date.getDay() + 6) % 7; // 0 = Mon … 6 = Sun
  if (dow === 6) return "off"; // Sunday closed
  if (time.startsWith("13")) return "off"; // lunch

  const r = hash(doctorId, dayKey(date), time) % 100;
  if (dow === 5) return r < 28 ? "working" : "off"; // Saturday: lighter
  if (r < 16) return "booked";
  if (r < 62) return "working";
  return "off";
}

/** Full week of base slots for a doctor at a given duration. */
export function buildWeek(
  doctorId: string,
  weekStart: Date,
  duration: SlotDuration,
): DaySlots[] {
  const times = buildTimes(duration);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    return {
      date,
      slots: times.map((time) => ({
        time,
        status: baseStatus(doctorId, date, time),
      })),
    };
  });
}

/** Count of free (working, bookable) slots on a given day — for month badges. */
export function countFreeOnDay(
  doctorId: string,
  date: Date,
  duration: SlotDuration,
): number {
  return buildTimes(duration).reduce(
    (n, time) => (baseStatus(doctorId, date, time) === "working" ? n + 1 : n),
    0,
  );
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
