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

/**
 * Status colour semantics (a11y: the colour is NEVER the only carrier — the
 * select shows the status as visible text; tints are an extra scanning aid):
 *  pending   — amber  "needs attention",
 *  confirmed — blue   "in progress",
 *  completed — green  "done",
 *  cancelled — muted grey "inactive".
 * `bar` — thin accent strip on the row/card edge (strongest accent);
 * `row` — whole-row/card tint at the *-100 level (uniform saturation across
 *         all four statuses) + a *-200 hover of the SAME hue; dark navy text
 *         stays well above 4.5:1 on every one of these backgrounds;
 * `select` — tinted border/background of the status select (its visible text
 *            value is the readable status carrier); bg one step lighter than
 *            the row so the control reads as a control.
 */
export const STATUS_META: Record<
  AdminOrderStatus,
  { label: string; bar: string; row: string; select: string }
> = {
  pending: {
    label: "Новий",
    bar: "bg-amber-400",
    row: "bg-amber-100 hover:bg-amber-200",
    select: "border-amber-300 bg-amber-50 text-amber-900",
  },
  confirmed: {
    label: "Підтверджено",
    bar: "bg-blue-500",
    row: "bg-blue-100 hover:bg-blue-200",
    select: "border-blue-300 bg-blue-50 text-blue-900",
  },
  completed: {
    label: "Виконано",
    bar: "bg-emerald-500",
    row: "bg-emerald-100 hover:bg-emerald-200",
    select: "border-emerald-300 bg-emerald-50 text-emerald-900",
  },
  cancelled: {
    label: "Скасовано",
    bar: "bg-red-500",
    row: "bg-red-100 hover:bg-red-200",
    select: "border-red-300 bg-red-50 text-red-900",
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
