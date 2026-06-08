/**
 * Wire types + client fetchers for the admin orders screen (STAFF/ADMIN).
 * Reuses ShopApiError so callers can branch on forbidden/not_found/etc.
 * cache: "no-store" — the SW also denies /api/admin/* (NetworkOnly).
 */

import { ShopApiError } from "@/lib/shop-client";
import type { ApiError } from "@/lib/shop-types";

export type AdminOrderStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled";

export type AdminDeliveryMethod = "pickup" | "nova_poshta";

export interface AdminOrderItem {
  name: string;
  quantity: number;
  /** Price per unit at purchase time (UAH). */
  price: number;
}

export interface AdminOrder {
  id: string;
  /** Short human-facing number derived from the id. */
  number: string;
  /** ISO datetime (UTC). */
  createdAt: string;
  contactName: string;
  contactPhone: string;
  deliveryMethod: AdminDeliveryMethod;
  npCity: string | null;
  npWarehouse: string | null;
  status: AdminOrderStatus;
  /** Server-computed order total (UAH). */
  total: number;
  items: AdminOrderItem[];
}

async function toError(res: Response): Promise<ShopApiError> {
  let body: Partial<ApiError> | null = null;
  try {
    body = (await res.json()) as ApiError;
  } catch {
    /* non-JSON */
  }
  return new ShopApiError(
    body?.code ?? "server",
    body?.error ?? "Сталася помилка. Спробуйте ще раз.",
    res.status,
  );
}

export async function getAdminOrders(
  signal?: AbortSignal,
): Promise<AdminOrder[]> {
  const res = await fetch("/api/admin/orders", { cache: "no-store", signal });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as AdminOrder[];
}

export async function updateOrderStatus(
  id: string,
  status: AdminOrderStatus,
): Promise<AdminOrder> {
  const res = await fetch(`/api/admin/orders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as AdminOrder;
}
