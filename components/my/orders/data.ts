/**
 * Presentation helpers for /my/orders (data from lib/my-orders / the API).
 * Status badge colours follow the admin orders palette + a "shipped" tone, in
 * the navy/mint system.
 */

import type { DeliveryMethod, MyOrderStatus } from "@/lib/my-orders";

export const STATUS_META: Record<MyOrderStatus, { label: string; badge: string }> = {
  pending: { label: "Новий", badge: "border-amber-300 bg-amber-50 text-amber-800" },
  confirmed: { label: "Підтверджено", badge: "border-blue-300 bg-blue-50 text-blue-800" },
  shipped: { label: "Відправлено", badge: "border-indigo-300 bg-indigo-50 text-indigo-800" },
  completed: { label: "Виконано", badge: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  cancelled: { label: "Скасовано", badge: "border-red-200 bg-red-50 text-red-700" },
};

export const DELIVERY_LABEL: Record<DeliveryMethod, string> = {
  pickup: "Самовивіз",
  nova_poshta: "Нова Пошта",
};
