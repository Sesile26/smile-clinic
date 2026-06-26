// node --import tsx lib/clinic-time.check.ts
import assert from "node:assert";
import {
  formatClinicTime,
  formatClinicDate,
  formatClinicDateTime,
  formatClinicDayLong,
} from "./clinic-time";

// Summer: Kyiv = UTC+3. 11:00Z → 14:00 Kyiv.
assert.equal(formatClinicTime("2026-06-22T11:00:00Z"), "14:00");
assert.equal(formatClinicDate("2026-06-22T11:00:00Z"), "22 червня 2026");
assert.equal(formatClinicDateTime("2026-06-22T11:00:00Z"), "22 червня 2026, 14:00");
// 2026-06-22 is a Monday.
assert.equal(formatClinicDayLong("2026-06-22T11:00:00Z"), "понеділок, 22 червня");

// Winter: Kyiv = UTC+2. 12:00Z → 14:00 Kyiv.
assert.equal(formatClinicTime("2026-01-15T12:00:00Z"), "14:00");

// Day-boundary: 23:30 Kyiv in summer = 20:30Z SAME day; 22:30Z = 01:30 NEXT day.
assert.equal(formatClinicDateTime("2026-06-22T20:30:00Z"), "22 червня 2026, 23:30");
assert.equal(formatClinicDateTime("2026-06-22T22:30:00Z"), "23 червня 2026, 01:30");

// Accepts Date and number too.
assert.equal(formatClinicTime(new Date("2026-06-22T11:00:00Z")), "14:00");
console.log("clinic-time formatters: OK");
