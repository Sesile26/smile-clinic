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
  category: string | null;
  stock: number;
  isActive: boolean;
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
  | "out_of_stock" // requested qty exceeds available stock
  | "inactive" // product is not purchasable (isActive=false / deleted)
  | "np_unavailable" // Nova Poshta proxy failed / no API key
  | "server";

export interface ApiError {
  error: string;
  code: ShopErrorCode;
}
