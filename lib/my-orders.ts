/**
 * The current user's purchase history (/my/orders) — wire types + client.
 *
 * Each item carries BOTH the historical price (priceAtPurchase, for display)
 * AND the product's CURRENT state (availability + currentPrice, for the reorder
 * button) — re-adding buys today's product at today's price, not the old one.
 *
 * cache: "no-store" — the SW also denies /api/my/* (NetworkOnly).
 */

import { ShopApiError } from "@/lib/shop-client";
import type { ApiError, ApiProduct } from "@/lib/shop-types";

export type MyOrderStatus =
  | "pending"
  | "confirmed"
  | "shipped"
  | "completed"
  | "cancelled";

export type DeliveryMethod = "pickup" | "nova_poshta";

/** Current availability of the product (drives the reorder button). */
export type ItemAvailability = "available" | "out_of_stock" | "removed";

export interface MyOrderItem {
  /** Current product id (for the /shop/[id] link + cart). */
  productId: string;
  name: string;
  imageUrl: string | null;
  categoryName: string | null;
  quantity: number;
  /** Price PAID at purchase (display) — frozen in OrderItem. */
  priceAtPurchase: number;
  /** Current catalog price — used when re-adding to the cart. */
  currentPrice: number;
  /** Derived from current isActive + stock (NO exact count is exposed). */
  availability: ItemAvailability;
}

export interface MyOrder {
  id: string;
  date: string; // ISO (createdAt)
  status: MyOrderStatus;
  deliveryMethod: DeliveryMethod;
  /** Order total, as paid (sum of priceAtPurchase * quantity). */
  total: number;
  items: MyOrderItem[];
}

export interface MyOrdersPage {
  items: MyOrder[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const ORDERS_PAGE_SIZE = 5;

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

export async function getMyOrders(
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<MyOrdersPage> {
  const sp = new URLSearchParams();
  if (page > 1) sp.set("page", String(page));
  if (pageSize !== ORDERS_PAGE_SIZE) sp.set("pageSize", String(pageSize));
  const qs = sp.toString();
  const res = await fetch(`/api/my/orders${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as MyOrdersPage;
}

/** Build an ApiProduct from a history item, to re-add the CURRENT product at
 *  the CURRENT price. Only meaningful when availability !== "removed". */
export function itemToProduct(item: MyOrderItem): ApiProduct {
  return {
    id: item.productId,
    name: item.name,
    description: null,
    price: item.currentPrice,
    imageUrl: item.imageUrl,
    categoryId: null,
    categoryName: item.categoryName,
    inStock: item.availability === "available",
    isActive: item.availability !== "removed",
  };
}
