/**
 * Wire types + client for /admin/customers (STAFF/ADMIN). A "customer" is a
 * User with ≥1 shop Order. Aggregates (order count, total spent, last order)
 * are computed server-side. The order-history shape reuses the /my/orders
 * status/delivery vocabulary (MyOrderStatus / DeliveryMethod) so the same badges
 * and card layout apply.
 *
 * Two endpoints (role re-checked on each):
 *   GET /api/admin/customers              → list (search / sort / pagination)
 *   GET /api/admin/customers/[id]/orders  → that customer's summary + a page of
 *                                           orders (with OrderItems + products)
 */

import { ShopApiError } from "@/lib/shop-client";
import type { ApiError } from "@/lib/shop-types";
import type { DeliveryMethod, MyOrderStatus } from "@/lib/my-orders";

export const CUSTOMERS_PAGE_SIZES = [25, 50, 100] as const;
export const CUSTOMERS_DEFAULT_PAGE_SIZE = 25;
export const CUSTOMER_ORDERS_PAGE_SIZE = 5;

export interface AdminCustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  orderCount: number;
  /** Sum of all order totals (UAH). */
  totalSpent: number;
  /** ISO of the most recent order, or null. */
  lastOrderAt: string | null;
}

export interface AdminCustomersPage {
  items: AdminCustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CustomerOrderItem {
  name: string;
  imageUrl: string | null;
  quantity: number;
  /** Price paid at purchase (historical, frozen on the OrderItem). */
  priceAtPurchase: number;
}

export interface CustomerOrder {
  id: string;
  date: string; // ISO (createdAt)
  status: MyOrderStatus;
  deliveryMethod: DeliveryMethod;
  total: number;
  items: CustomerOrderItem[];
}

export interface CustomerOrdersPage {
  items: CustomerOrder[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Customer summary + one page of their orders (the detail view's single fetch). */
export interface CustomerHistory {
  customer: AdminCustomerRow;
  orders: CustomerOrdersPage;
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

export async function getAdminCustomers(
  query: { q?: string; page?: number; pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<AdminCustomersPage> {
  const sp = new URLSearchParams();
  if (query.q?.trim()) sp.set("q", query.q.trim());
  if (query.page && query.page > 1) sp.set("page", String(query.page));
  if (query.pageSize) sp.set("pageSize", String(query.pageSize));
  const qs = sp.toString();
  const res = await fetch(`/api/admin/customers${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as AdminCustomersPage;
}

export async function getCustomerHistory(
  id: string,
  page = 1,
  signal?: AbortSignal,
): Promise<CustomerHistory> {
  const qs = page > 1 ? `?page=${page}` : "";
  const res = await fetch(`/api/admin/customers/${id}/orders${qs}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as CustomerHistory;
}
