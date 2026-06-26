/**
 * Client-side fetch wrappers for the shop API. Each throws a {@link ShopApiError}
 * carrying the server's machine code so callers can branch (out_of_stock,
 * forbidden, np_unavailable, …). cache: "no-store" — the SW also denies these
 * routes (NetworkOnly).
 */

import type {
  ApiCategory,
  ApiError,
  ApiOrder,
  ApiProduct,
  ApiProductDetail,
  CheckoutDefaults,
  CreateOrderInput,
  NpOption,
  ProductsPage,
  ShopErrorCode,
} from "@/lib/shop-types";

export class ShopApiError extends Error {
  constructor(
    public code: ShopErrorCode,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ShopApiError";
  }
}

async function toError(res: Response): Promise<ShopApiError> {
  let body: Partial<ApiError> | null = null;
  try {
    body = (await res.json()) as ApiError;
  } catch {
    /* non-JSON error body */
  }
  return new ShopApiError(
    body?.code ?? "server",
    body?.error ?? "Сталася помилка. Спробуйте ще раз.",
    res.status,
  );
}

export async function getProducts(signal?: AbortSignal): Promise<ApiProduct[]> {
  const res = await fetch("/api/products", { cache: "no-store", signal });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ApiProduct[];
}

/** Single product detail. null on 404 (missing / soft-deleted) → "not found"
 *  state; other failures throw a {@link ShopApiError}. */
export async function getProduct(
  id: string,
  signal?: AbortSignal,
): Promise<ApiProductDetail | null> {
  const res = await fetch(`/api/products/${id}`, { cache: "no-store", signal });
  if (res.status === 404) return null;
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ApiProductDetail;
}

export interface ProductFeedParams {
  q?: string;
  /** Category id, "all", or the UNCATEGORIZED sentinel. */
  category?: string;
  cursor?: string | null;
  limit?: number;
}

/**
 * One page of the storefront feed. Passing `limit` switches the API into
 * cursor-pagination mode (search + category + stock-first sort happen server
 * side). getProducts() (no params) keeps returning the full array for the
 * admin list, cart validation, and the offline mirror.
 */
export async function getProductsPage(
  params: ProductFeedParams,
  signal?: AbortSignal,
): Promise<ProductsPage> {
  const sp = new URLSearchParams();
  sp.set("limit", String(params.limit ?? 24));
  if (params.q?.trim()) sp.set("q", params.q.trim());
  if (params.category && params.category !== "all") sp.set("category", params.category);
  if (params.cursor) sp.set("cursor", params.cursor);
  const res = await fetch(`/api/products?${sp.toString()}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ProductsPage;
}

export interface ProductInput {
  name: string;
  description?: string;
  price: number;
  stock: number;
  /** Existing category id, or null for "Без категорії". */
  categoryId: string | null;
  /** Cover photo (catalog card + first on the product page). One of `images`. */
  imageUrl?: string;
  /** Ordered gallery (variant A): the saved order IS the display order. */
  images?: string[];
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function getCategories(
  signal?: AbortSignal,
): Promise<ApiCategory[]> {
  const res = await fetch("/api/categories", { cache: "no-store", signal });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ApiCategory[];
}

export async function createCategory(name: string): Promise<ApiCategory> {
  const res = await fetch("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ApiCategory;
}

export async function renameCategory(
  id: string,
  name: string,
): Promise<ApiCategory> {
  const res = await fetch(`/api/categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ApiCategory;
}

/** Delete a category. When it still has products, pass reassign=true to move
 *  them to "Без категорії" first (server does it in one transaction). */
export async function deleteCategory(
  id: string,
  reassign = false,
): Promise<void> {
  const qs = reassign ? "?reassign=null" : "";
  const res = await fetch(`/api/categories/${id}${qs}`, { method: "DELETE" });
  if (!res.ok) throw await toError(res);
}

export async function createProduct(input: ProductInput): Promise<ApiProduct> {
  const res = await fetch("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ApiProduct;
}

export async function updateProduct(
  id: string,
  input: Partial<ProductInput> & { isActive?: boolean; isFeatured?: boolean },
): Promise<ApiProduct> {
  const res = await fetch(`/api/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ApiProduct;
}

export async function deleteProduct(id: string): Promise<void> {
  const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
  if (!res.ok) throw await toError(res);
}

export async function createOrder(input: CreateOrderInput): Promise<ApiOrder> {
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ApiOrder;
}

/** Prefill values for the checkout form, from the user's last order. Returns
 *  null when they have no orders yet (first purchase → empty form). Auth-only:
 *  callers fetch this only while signed in. */
export async function getCheckoutDefaults(
  signal?: AbortSignal,
): Promise<CheckoutDefaults | null> {
  const res = await fetch("/api/my/checkout-defaults", {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as CheckoutDefaults | null;
}

// ─── Nova Poshta (via server proxy) ──────────────────────────────────────────

export async function npCities(
  query: string,
  signal?: AbortSignal,
): Promise<NpOption[]> {
  const res = await fetch("/api/nova-poshta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "cities", query }),
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as NpOption[];
}

export async function npWarehouses(
  cityRef: string,
  query: string,
  signal?: AbortSignal,
): Promise<NpOption[]> {
  const res = await fetch("/api/nova-poshta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "warehouses", cityRef, query }),
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as NpOption[];
}
