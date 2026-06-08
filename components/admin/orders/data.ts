/**
 * Presentation helpers for the /admin/orders UI. The data itself now comes from
 * the API (see lib/admin-orders + hooks in OrdersPage); this module only holds
 * status labels/colours, delivery formatting and a TZ-stable date formatter.
 */

import type { AdminOrder, AdminOrderStatus } from "@/lib/admin-orders";

export const STATUS_ORDER: AdminOrderStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
];

export const STATUS_META: Record<
  AdminOrderStatus,
  { label: string; badge: string }
> = {
  pending: {
    label: "Новий",
    badge: "border-amber-300 bg-amber-50 text-amber-700",
  },
  confirmed: {
    label: "Підтверджено",
    badge: "border-mint/40 bg-mint-100 text-mint-600",
  },
  completed: {
    label: "Виконано",
    badge: "border-navy-900/15 bg-navy-900 text-white",
  },
  cancelled: {
    label: "Скасовано",
    badge: "border-red-200 bg-red-50 text-red-600",
  },
};

export function deliveryLabel(o: AdminOrder): string {
  return o.deliveryMethod === "pickup"
    ? "Самовивіз із клініки"
    : `Нова Пошта — ${o.npCity ?? "—"}, ${o.npWarehouse ?? "—"}`;
}

const MONTHS_GEN = [
  "січ", "лют", "бер", "кві", "тра", "чер",
  "лип", "сер", "вер", "жов", "лис", "гру",
];

/**
 * "7 чер 2026, 14:30" — formatted from UTC parts so server and client agree
 * (no hydration mismatch from locale/timezone).
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${p(
    d.getUTCHours(),
  )}:${p(d.getUTCMinutes())}`;
}
