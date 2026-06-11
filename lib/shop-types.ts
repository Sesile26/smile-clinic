/**
 * Wire types shared by the shop API (server) and the /shop client.
 *
 * Money is sent as a NUMBER of UAH (грн) on the wire for display only — the
 * server is the single source of truth for prices and totals (it reads
 * Product.price as Decimal and never trusts a client-sent amount).
 */

export interface ApiProduct {
  id: string;
  name: string;
  description: string | null;
  /** UAH, for display. Server computes order totals from the DB, not this. */
  price: number;
  imageUrl: string | null;
  /** FK to Category — the catalog filter matches on this id (null = "Без
   *  категорії"). The denormalized name below is for display only. */
  categoryId: string | null;
  categoryName: string | null;
  /** Public availability — always present, the only stock signal patients get. */
  inStock: boolean;
  /** Exact remaining units. Sent ONLY to STAFF/ADMIN; undefined for patients
   *  and guests (the server omits it — see lib/shop-server toApiProduct). */
  stock?: number;
  isActive: boolean;
}

/** A product category with its live product count (for the manage panel). */
export interface ApiCategory {
  id: string;
  name: string;
  productCount: number;
}

/** One line a client wants to order — only id + quantity are trusted. */
export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export type DeliveryMethod = "pickup" | "nova_poshta";

export interface CreateOrderInput {
  items: OrderItemInput[];
  deliveryMethod: DeliveryMethod;
  contactName: string;
  contactPhone: string;
  /** Required only for nova_poshta. */
  npCity?: string;
  npWarehouse?: string;
}

export interface ApiOrder {
  id: string;
  status: string;
  total: number;
}

/** Nova Poshta lookup result (city or warehouse), normalised. */
export interface NpOption {
  ref: string;
  name: string;
}

/** Stable error codes the shop UI branches on. */
export type ShopErrorCode =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "not_found"
  | "conflict" // duplicate name, or delete blocked by referencing rows
  | "out_of_stock" // requested qty exceeds available stock
  | "inactive" // product is not purchasable (isActive=false / deleted)
  | "np_unavailable" // Nova Poshta proxy failed / no API key
  | "server";

export interface ApiError {
  error: string;
  code: ShopErrorCode;
}
