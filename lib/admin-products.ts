/**
 * Wire types + client for the admin products table (STAFF/ADMIN). Offset
 * pagination + category(slug)/search filter — distinct from the public
 * cursor-paginated storefront feed. Reuses ApiProduct (carries stock /
 * isFeatured / isActive for management).
 */

import { ShopApiError } from "@/lib/shop-client";
import type { ApiError, ApiProduct } from "@/lib/shop-types";

export const PRODUCT_PAGE_SIZES = [25, 50, 100] as const;
export const PRODUCT_DEFAULT_PAGE_SIZE = 25;

export interface AdminProductsPage {
  items: ApiProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminProductsQuery {
  q?: string;
  /** Category SLUG (same as /shop), "all", or the uncategorized sentinel. */
  category?: string;
  page?: number;
  pageSize?: number;
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

/**
 * Upload a product image to Vercel Blob via the server route. Returns the
 * public Blob URL — the caller writes it into Product.imageUrl through the
 * normal product save (POST/PATCH). STAFF/ADMIN only (enforced server-side).
 */
export async function uploadProductImage(
  file: File,
  signal?: AbortSignal,
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/admin/products/upload", {
    method: "POST",
    body: form,
    signal,
  });
  if (!res.ok) throw await toError(res);
  const data = (await res.json()) as { url: string };
  return data.url;
}

export async function getAdminProducts(
  query: AdminProductsQuery = {},
  signal?: AbortSignal,
): Promise<AdminProductsPage> {
  const sp = new URLSearchParams();
  if (query.q?.trim()) sp.set("q", query.q.trim());
  if (query.category && query.category !== "all") sp.set("category", query.category);
  if (query.page && query.page > 1) sp.set("page", String(query.page));
  if (query.pageSize) sp.set("pageSize", String(query.pageSize));
  const qs = sp.toString();
  const res = await fetch(`/api/admin/products${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as AdminProductsPage;
}
