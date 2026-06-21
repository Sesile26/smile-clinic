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
  /** Featured products sort first (among in-stock). Optional: the offline Dexie
   *  mirror doesn't carry it (offline stays stock-first), so it may be absent. */
  isFeatured?: boolean;
}

/** A product category with its live product count (for the manage panel). */
export interface ApiCategory {
  id: string;
  name: string;
  /** URL slug for the storefront category filter (?category=<slug>). */
  slug: string;
  productCount: number;
}

/** One page of the storefront feed (cursor pagination). */
export interface ProductsPage {
  items: ApiProduct[];
  /** Opaque cursor for the next page, or null when there are no more. */
  nextCursor: string | null;
  hasMore: boolean;
  /** Total matching the current filters (search + category), across all pages. */
  total: number;
}

/** Single-product detail (GET /api/products/[id]) — the card fields plus the
 *  rich page content and a few same-category products. */
export interface ApiProductDetail extends ApiProduct {
  longDescription: string | null;
  /** Category slug for the breadcrumb / "back to category" link (?category=). */
  categorySlug: string | null;
  /** Gallery photos; may be empty (then the UI falls back to imageUrl/glyph). */
  images: string[];
  similar: ApiProduct[];
}

/** Sentinel category filter value for products with no category. Mirrors
 *  useShopCategories.UNCATEGORIZED — shared so the API and UI agree. */
export const UNCATEGORIZED_VALUE = "__uncategorized__";

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

/**
 * Prefill values for the checkout form, taken from the user's LAST order so a
 * repeat purchase doesn't retype everything. `null` when the user has no orders
 * yet. The source of truth is the server (the last Order row) — nothing is kept
 * in localStorage/Dexie, so it follows the user across devices.
 */
export interface CheckoutDefaults {
  contactName: string;
  contactPhone: string;
  deliveryMethod: DeliveryMethod;
  /** Stored only for nova_poshta; null for pickup. Names, not NP refs. */
  npCity: string | null;
  npWarehouse: string | null;
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
