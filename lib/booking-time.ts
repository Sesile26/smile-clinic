/**
 * Time helpers shared by the booking API (server) and the /booking UI (client).
 *
 * TZ CONTRACT (agreed):
 *   • The DB stores AvailabilitySlot.startsAt/endsAt as UTC instants.
 *   • The UI works in the user's LOCAL time: a calendar cell is a local
 *     (date, "HH:MM") pair.
 *   • Conversion happens at the boundary only:
 *       local cell  ──cellToUtcISO──▶  UTC ISO sent to the server
 *       UTC ISO     ──utcToLocalCell──▶ local (dateKey, "HH:MM") for display
 *   This keeps a single source of truth (UTC) with no double-shifting.
 *
 * No React, no Node built-ins — safe to import from both route handlers and
 * client components.
 */

// Booking is hour-only. The single source of truth for slot length — UI grid,
// slot creation, and the API validation all derive from this.
export type SlotDuration = 60;

export const SLOT_DURATION_MIN: SlotDuration = 60;

export const SLOT_DURATIONS: SlotDuration[] = [60];

/** Clinic working window, in local minutes-from-midnight. */
export const WORK_START_MIN = 9 * 60; // 09:00
export const WORK_END_MIN = 18 * 60; // 18:00

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "HH:MM" label for a minutes-from-midnight value. */
export function minutesToTime(min: number): string {
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
}

/** Parse "HH:MM" → minutes from midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Hourly grid time labels across the working window (09:00, 10:00, … 17:00).
 * `duration` is always 60 now; the param is kept for call-site clarity.
 */
export function buildTimes(duration: SlotDuration = SLOT_DURATION_MIN): string[] {
  const out: string[] = [];
  for (let m = WORK_START_MIN; m < WORK_END_MIN; m += duration) {
    out.push(minutesToTime(m));
  }
  return out;
}

/** Local "YYYY-MM-DD" key for a Date (used for React keys and slot lookup). */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * A local calendar cell (the day's Date + "HH:MM") → the UTC instant for that
 * wall-clock moment, as an ISO string. new Date(y,m,d,h,min) is interpreted in
 * the runtime's local zone; toISOString() renders it in UTC.
 */
export function cellToUtcISO(localDay: Date, time: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Date(
    localDay.getFullYear(),
    localDay.getMonth(),
    localDay.getDate(),
    h,
    m,
    0,
    0,
  ).toISOString();
}

/** endsAt for a cell = startsAt + duration, as a UTC ISO string. */
export function cellEndUtcISO(
  localDay: Date,
  time: string,
  duration: SlotDuration,
): string {
  const [h, m] = time.split(":").map(Number);
  return new Date(
    localDay.getFullYear(),
    localDay.getMonth(),
    localDay.getDate(),
    h,
    m + duration,
    0,
    0,
  ).toISOString();
}

/** UTC ISO instant → local { dateKey, time } the grid can match against. */
export function utcToLocalCell(iso: string | Date): {
  dateKey: string;
  time: string;
} {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return {
    dateKey: localDateKey(d),
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

/** Composite key for a per-(day,time) slot lookup map. */
export function cellKey(dateKey: string, time: string): string {
  return `${dateKey}|${time}`;
}

/** Slot duration (minutes) between two ISO instants. */
export function isoDurationMinutes(startsAt: string, endsAt: string): number {
  return Math.round(
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000,
  );
}
