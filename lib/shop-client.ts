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
  CreateOrderInput,
  NpOption,
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

export interface ProductInput {
  name: string;
  description?: string;
  price: number;
  stock: number;
  /** Existing category id, or null for "Без категорії". */
  categoryId: string | null;
  imageUrl?: string;
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
  input: Partial<ProductInput> & { isActive?: boolean },
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
