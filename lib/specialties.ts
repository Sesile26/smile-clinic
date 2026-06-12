/**
 * Specialty reference directory — wire type + client fetch wrappers.
 *
 * Mirrors the categories integration (lib/shop-client category fns): GET is
 * public (the booking filter and the doctor form read it); mutations are
 * STAFF/ADMIN (re-checked server-side). Errors reuse {@link ShopApiError} so
 * callers branch on the same machine codes. cache: "no-store" — the SW also
 * denies these routes (NetworkOnly).
 */

import { ShopApiError } from "@/lib/shop-client";
import type { ApiError } from "@/lib/shop-types";

/** A doctor specialty with its live doctor count (for the manage panel). */
export interface ApiSpecialty {
  id: string;
  name: string;
  doctorCount: number;
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

export async function getSpecialties(
  signal?: AbortSignal,
): Promise<ApiSpecialty[]> {
  const res = await fetch("/api/specialties", { cache: "no-store", signal });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ApiSpecialty[];
}

export async function createSpecialty(name: string): Promise<ApiSpecialty> {
  const res = await fetch("/api/specialties", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ApiSpecialty;
}

export async function renameSpecialty(
  id: string,
  name: string,
): Promise<ApiSpecialty> {
  const res = await fetch(`/api/specialties/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ApiSpecialty;
}

/** Delete a specialty. When doctors still reference it, pass reassign=true to
 *  move them to "Без спеціальності" (specialtyId = null) first — the server
 *  does it in one transaction. */
export async function deleteSpecialty(
  id: string,
  reassign = false,
): Promise<void> {
  const qs = reassign ? "?reassign=null" : "";
  const res = await fetch(`/api/specialties/${id}${qs}`, { method: "DELETE" });
  if (!res.ok) throw await toError(res);
}
