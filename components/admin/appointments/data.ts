/**
 * Presentation helpers for /admin/appointments (data comes from the API — see
 * lib/admin-appointments). Status colours match the rest of the admin; the WORD
 * is always shown (colour is only a scanning aid). Dates from UTC parts so
 * server and client agree (no hydration drift).
 */

import type { AppointmentStatus } from "@/lib/admin-appointments";

export type { AppointmentStatus };

export const STATUS_META: Record<
  AppointmentStatus,
  { label: string; badge: string; dot: string }
> = {
  pending: {
    label: "Очікує",
    badge: "border-amber-300 bg-amber-50 text-amber-800",
    dot: "bg-amber-400",
  },
  confirmed: {
    label: "Підтверджено",
    badge: "border-blue-300 bg-blue-50 text-blue-800",
    dot: "bg-blue-500",
  },
  done: {
    label: "Виконано",
    badge: "border-emerald-300 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
  },
  cancelled: {
    label: "Скасовано",
    badge: "border-red-300 bg-red-50 text-red-800",
    dot: "bg-red-500",
  },
};

const MONTHS_GEN = [
  "січ", "лют", "бер", "кві", "тра", "чер",
  "лип", "сер", "вер", "жов", "лис", "гру",
];

/** "7 чер 2026, 14:00" from UTC parts — deterministic. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${p(
    d.getUTCHours(),
  )}:${p(d.getUTCMinutes())}`;
}
