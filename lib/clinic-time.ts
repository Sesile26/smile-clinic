/**
 * Clinic-timezone date helpers (server-side). "Today" / "this week" are the
 * clinic's WALL-CLOCK day, not UTC — so an appointment query late in the
 * evening (when UTC may already be on the next/previous date) still returns the
 * right rows. All boundaries are returned as UTC `Date` instants for Prisma.
 */

export const CLINIC_TZ = "Europe/Kyiv";
const DAY_MS = 86400000;

/** Offset (ms, east-positive) of `tz` at the given instant. */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) m[p.type] = p.value;
  const asUtc = Date.UTC(
    +m.year,
    +m.month - 1,
    +m.day,
    +m.hour,
    +m.minute,
    +m.second,
  );
  return asUtc - date.getTime();
}

/** UTC instant of clinic-local midnight (00:00) of the given calendar day. */
export function zonedDayStartUtc(y: number, mo: number, d: number): Date {
  const utcMidnight = Date.UTC(y, mo - 1, d, 0, 0, 0);
  // The offset near midnight is stable (Kyiv DST switches at 03:00/04:00).
  const off = tzOffsetMs(new Date(utcMidnight), CLINIC_TZ);
  return new Date(utcMidnight - off);
}

/** Clinic-local calendar Y/M/D of an instant. */
function clinicYmd(now: Date): [number, number, number] {
  const [y, mo, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);
  return [y, mo, d];
}

/** [start, end) covering the clinic-local day that contains `now`. */
export function clinicTodayRange(now = new Date()): { start: Date; end: Date } {
  const start = zonedDayStartUtc(...clinicYmd(now));
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** [start, end) covering 7 clinic-local days starting today. */
export function clinicWeekRange(now = new Date()): { start: Date; end: Date } {
  const start = zonedDayStartUtc(...clinicYmd(now));
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

/** Parse "YYYY-MM-DD" → clinic-local day start (UTC), or null if malformed. */
export function clinicDayStartFromYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return zonedDayStartUtc(+m[1], +m[2], +m[3]);
}

/** Exclusive end-of-day (UTC) for a "YYYY-MM-DD" clinic-local date. */
export function clinicDayEndFromYmd(s: string): Date | null {
  const start = clinicDayStartFromYmd(s);
  return start ? new Date(start.getTime() + DAY_MS) : null;
}

// ─── Display formatters (the ONE clinic-local formatter used everywhere) ──────
//
// A UTC instant → its Europe/Kyiv wall-clock parts, formatted in uk. Pinned to
// CLINIC_TZ so every surface (admin table, /booking, /my, slot popup,
// notifications) shows the SAME time regardless of the viewer's device zone —
// and so server- and client-rendered output match (no hydration drift). Safe in
// both server and client code (Intl only, no Node built-ins).

const MONTHS_GEN = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
];
const WEEKDAYS = [
  "неділя", "понеділок", "вівторок", "середа", "четвер", "пʼятниця", "субота",
];

const _clinicParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLINIC_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function clinicYmdHm(value: string | number | Date): {
  y: number; mo: number; day: number; hour: number; minute: number; weekday: number;
} {
  const date = value instanceof Date ? value : new Date(value);
  const m: Record<string, string> = {};
  for (const p of _clinicParts.formatToParts(date)) {
    if (p.type !== "literal") m[p.type] = p.value;
  }
  const y = +m.year, mo = +m.month, day = +m.day;
  // Weekday of the clinic-local calendar day (UTC getter on a UTC-constructed
  // Y/M/D avoids any second zone shift).
  const weekday = new Date(Date.UTC(y, mo - 1, day)).getUTCDay();
  return { y, mo, day, hour: +m.hour, minute: +m.minute, weekday };
}

const pad2c = (n: number) => String(n).padStart(2, "0");

/** "14:00" (clinic local). */
export function formatClinicTime(value: string | number | Date): string {
  const { hour, minute } = clinicYmdHm(value);
  return `${pad2c(hour)}:${pad2c(minute)}`;
}

/** "12 червня 2026" (clinic local). */
export function formatClinicDate(value: string | number | Date): string {
  const { y, mo, day } = clinicYmdHm(value);
  return `${day} ${MONTHS_GEN[mo - 1]} ${y}`;
}

/** "12 червня 2026, 14:00" (clinic local). */
export function formatClinicDateTime(value: string | number | Date): string {
  return `${formatClinicDate(value)}, ${formatClinicTime(value)}`;
}

/** "четвер, 12 червня" (clinic local) — prominent line on appointment cards. */
export function formatClinicDayLong(value: string | number | Date): string {
  const { mo, day, weekday } = clinicYmdHm(value);
  return `${WEEKDAYS[weekday]}, ${day} ${MONTHS_GEN[mo - 1]}`;
}
