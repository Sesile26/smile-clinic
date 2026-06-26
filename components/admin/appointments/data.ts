/**
 * Presentation helpers for /admin/appointments (data comes from the API — see
 * lib/admin-appointments). Status colours match the rest of the admin; the WORD
 * is always shown (colour is only a scanning aid). Time is the shared
 * clinic-local formatter (CLINIC_TZ) so it matches /booking, /my and
 * notifications and stays hydration-safe.
 */

import type { AppointmentStatus } from "@/lib/admin-appointments";
import { formatClinicDateTime } from "@/lib/clinic-time";

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

/** "12 червня 2026, 14:00" in clinic-local time. */
export function formatDateTime(iso: string): string {
  return formatClinicDateTime(iso);
}
