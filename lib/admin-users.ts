/**
 * Wire types + client fetchers for /admin/users (role management) — ADMIN only.
 * The server enforces every rule (own-role, last-admin, doctor link/unlink)
 * independently of the proxy guard. cache: "no-store" — the SW denies
 * /api/admin/* (NetworkOnly).
 */

import { ShopApiError } from "@/lib/shop-client";
import type { ApiError } from "@/lib/shop-types";

export type Role = "ADMIN" | "STAFF" | "DOCTOR" | "PATIENT";

export const USERS_PAGE_SIZES = [25, 50, 100] as const;
export const USERS_DEFAULT_PAGE_SIZE = 25;

export type Linkage =
  | { type: "patient"; name: string }
  | {
      type: "doctor";
      id: string;
      name: string;
      specialtyId: string | null;
      specialtyName: string | null;
    }
  | null;

export interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  /** ISO datetime (UTC). */
  createdAt: string;
  linkage: Linkage;
}

export interface AdminUsersPage {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminUsersQuery {
  q?: string;
  role?: Role | null;
  page?: number;
  pageSize?: number;
}

export interface UnlinkedDoctor {
  id: string;
  name: string;
  specialtyName: string | null;
}

/** Body for a role change. For role === DOCTOR exactly one of doctorId /
 *  newDoctor is required (bind an existing unlinked Doctor, or create one).
 *  A new doctor's specialty is chosen from the directory by id (null = none). */
export interface ChangeRoleInput {
  role: Role;
  doctorId?: string;
  newDoctor?: { name: string; specialtyId: string | null };
}

/** Doctor card shape returned by PATCH /api/admin/doctors/[id]. */
export interface AdminDoctor {
  id: string;
  name: string;
  specialtyId: string | null;
  specialtyName: string | null;
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

export async function getAdminUsers(
  query: AdminUsersQuery = {},
  signal?: AbortSignal,
): Promise<AdminUsersPage> {
  const p = new URLSearchParams();
  if (query.q?.trim()) p.set("q", query.q.trim());
  if (query.role) p.set("role", query.role);
  if (query.page && query.page > 1) p.set("page", String(query.page));
  if (query.pageSize) p.set("pageSize", String(query.pageSize));
  const qs = p.toString();
  const res = await fetch(`/api/admin/users${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as AdminUsersPage;
}

export async function changeUserRole(
  id: string,
  input: ChangeRoleInput,
): Promise<AdminUser> {
  const res = await fetch(`/api/admin/users/${id}/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as AdminUser;
}

/** Doctor rows with no linked account — selectable when promoting to DOCTOR. */
export async function getUnlinkedDoctors(
  signal?: AbortSignal,
): Promise<UnlinkedDoctor[]> {
  const res = await fetch("/api/doctors?unlinked=1", {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  const rows = (await res.json()) as {
    id: string;
    name: string;
    specialtyName: string | null;
  }[];
  return rows.map((d) => ({ id: d.id, name: d.name, specialtyName: d.specialtyName }));
}

/** Update a doctor's specialty (ADMIN only). specialtyId = null → no specialty.
 *  The endpoint is general (may accept `name` later); here we send specialtyId. */
export async function updateDoctorSpecialty(
  doctorId: string,
  specialtyId: string | null,
): Promise<AdminDoctor> {
  const res = await fetch(`/api/admin/doctors/${doctorId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ specialtyId }),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as AdminDoctor;
}
