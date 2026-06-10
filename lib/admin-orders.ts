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

/** Allowed page sizes — mirrors the server (the API is authoritative). */
export const ORDERS_PAGE_SIZES = [25, 50, 100] as const;
export const ORDERS_DEFAULT_PAGE_SIZE = 25;

export interface AdminOrdersQuery {
  /** Omit / null → all statuses. */
  status?: AdminOrderStatus | null;
  /** Name / phone / order-number search (server-side). */
  q?: string;
  /** Date range, YYYY-MM-DD (UTC day bounds — matches the displayed dates). */
  from?: string | null;
  to?: string | null;
  /** 1-based page number (default 1). */
  page?: number;
  /** One of ORDERS_PAGE_SIZES (default 25). */
  pageSize?: number;
}

export interface AdminOrdersPage {
  items: AdminOrder[];
  /** Total rows matching the filters (across ALL pages). */
  total: number;
  /** Echoed (validated) pagination the server actually used. */
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getAdminOrders(
  query: AdminOrdersQuery = {},
  signal?: AbortSignal,
): Promise<AdminOrdersPage> {
  const p = new URLSearchParams();
  if (query.status) p.set("status", query.status);
  if (query.q?.trim()) p.set("q", query.q.trim());
  if (query.from) p.set("from", query.from);
  if (query.to) p.set("to", query.to);
  if (query.page && query.page > 1) p.set("page", String(query.page));
  if (query.pageSize) p.set("pageSize", String(query.pageSize));
  const qs = p.toString();
  const res = await fetch(`/api/admin/orders${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as AdminOrdersPage;
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
