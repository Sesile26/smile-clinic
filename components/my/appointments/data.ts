/**
 * Presentation helpers for /my/appointments. Data now comes from the API
 * (lib/my-appointments) or the Dexie mirror offline; this module only holds
 * status labels/colours, the upcoming/past rule, and uk date formatters.
 *
 * Dates on the wire are UTC ISO; formatters are the shared CLINIC_TZ ones so
 * the time matches /booking, /admin and notifications exactly.
 */

import type { MyAppointment, MyApptStatus } from "@/lib/my-appointments";
import {
  formatClinicDate,
  formatClinicTime,
  formatClinicDayLong,
} from "@/lib/clinic-time";

export type Appointment = MyAppointment;
export type ApptStatus = MyApptStatus;

export const CLINIC_ADDRESS = "вул. Хорива, 24, Київ";

export const STATUS_META: Record<ApptStatus, { label: string; badge: string }> = {
  pending: {
    label: "Очікує підтвердження",
    badge: "border-amber-300 bg-amber-50 text-amber-700",
  },
  confirmed: {
    label: "Підтверджено",
    badge: "border-mint/40 bg-mint-100 text-mint-600",
  },
  done: {
    label: "Виконано",
    badge: "border-navy-900/15 bg-navy-900/[0.06] text-navy-700",
  },
  cancelled: {
    label: "Скасовано",
    badge: "border-red-200 bg-red-50 text-red-600",
  },
};

/**
 * Upcoming = an active (pending/confirmed) visit dated now-or-later. Everything
 * else — done, cancelled, or simply in the past — is history.
 */
export function isUpcoming(a: Appointment, now: Date): boolean {
  if (a.status === "cancelled" || a.status === "done") return false;
  return new Date(a.date).getTime() >= now.getTime();
}

// ─── Date formatting (clinic-local, shared) ──────────────────────────────────

/** "12 червня 2026" (clinic local). */
export function formatDate(iso: string): string {
  return formatClinicDate(iso);
}

/** "10:30" (clinic local). */
export function formatTime(iso: string): string {
  return formatClinicTime(iso);
}

/** "четвер, 12 червня" (clinic local) — prominent line on upcoming cards. */
export function formatDayLong(iso: string): string {
  return formatClinicDayLong(iso);
}
