/**
 * Server-side helpers for the shop API. Authorization is decided HERE from the
 * session (never a client field): catalog reads are public, but every product
 * mutation requires STAFF/ADMIN, re-checked in each route handler.
 *
 * Reuses getActor/isStaff from the booking layer (same session shape).
 */

import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import type { ApiError, ApiProduct, ShopErrorCode } from "@/lib/shop-types";

export { getActor, isStaff } from "@/lib/booking-server";
export type { Actor } from "@/lib/booking-server";

/** JSON error with a stable machine code. */
export function shopError(
  status: number,
  code: ShopErrorCode,
  message: string,
): NextResponse<ApiError> {
  return NextResponse.json<ApiError>({ error: message, code }, { status });
}

/** Columns every product endpoint reads; `stock` is fetched but only EXPOSED
 *  to STAFF/ADMIN (see toApiProduct). Category comes via the relation — we send
 *  both the id (for filtering) and the name (for display). */
export const PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  price: true,
  imageUrl: true,
  categoryId: true,
  category: { select: { name: true } },
  stock: true,
  isActive: true,
} as const;

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  price: Prisma.Decimal;
  imageUrl: string | null;
  categoryId: string | null;
  category: { name: string } | null;
  stock: number;
  isActive: boolean;
};

/**
 * Map a DB product row to the wire shape. The exact `stock` count is included
 * ONLY when `includeStock` (STAFF/ADMIN) — everyone else (patients, guests)
 * gets just the `inStock` boolean. This is the single gate for stock exposure:
 * the number never leaves the server for non-staff, so hiding it in the UI is
 * no longer the only defence.
 */
export function toApiProduct(
  p: ProductRow,
  includeStock: boolean,
): ApiProduct {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price.toNumber(),
    imageUrl: p.imageUrl,
    categoryId: p.categoryId,
    categoryName: p.category?.name ?? null,
    inStock: p.stock > 0,
    ...(includeStock ? { stock: p.stock } : {}),
    isActive: p.isActive,
  };
}

/** Canonical UA phone check (matches schemas/register + the shop UI). */
export function isValidUaPhone(value: string): boolean {
  return /^\+380\d{9}$/.test(value.replace(/\s/g, ""));
}
