/**
 * Server-side helpers for the shop API. Authorization is decided HERE from the
 * session (never a client field): catalog reads are public, but every product
 * mutation requires STAFF/ADMIN, re-checked in each route handler.
 *
 * Reuses getActor/isStaff from the booking layer (same session shape).
 */

import { NextResponse } from "next/server";
import type { ApiError, ShopErrorCode } from "@/lib/shop-types";

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

/** Canonical UA phone check (matches schemas/register + the shop UI). */
export function isValidUaPhone(value: string): boolean {
  return /^\+380\d{9}$/.test(value.replace(/\s/g, ""));
}
