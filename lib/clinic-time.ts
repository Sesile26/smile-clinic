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
