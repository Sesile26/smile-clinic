/**
 * Wire types + client fetchers for the /admin/patients screen
 * (STAFF/ADMIN/DOCTOR). Reuses ShopApiError so callers branch on
 * forbidden/not_found/etc. cache: "no-store" — the SW also denies /api/admin/*
 * (NetworkOnly). Role scoping (a DOCTOR sees only their own patients/records)
 * is enforced SERVER-SIDE; the client never decides access.
 */

import { ShopApiError } from "@/lib/shop-client";
import type { ApiError } from "@/lib/shop-types";

/** Matches the Prisma AppointmentStatus enum (NOT the order statuses). */
export type AppointmentStatus = "pending" | "confirmed" | "done" | "cancelled";

export const PATIENTS_PAGE_SIZES = [25, 50, 100] as const;
export const PATIENTS_DEFAULT_PAGE_SIZE = 25;

export interface AdminPatientRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** Appointments counted within the caller's scope (a DOCTOR sees only their
   *  own appointments with this patient). */
  appointmentCount: number;
  /** ISO of the most recent appointment in scope, or null. */
  lastVisitAt: string | null;
}

export interface AdminPatientsPage {
  items: AdminPatientRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminPatientAppointment {
  id: string;
  /** ISO datetime (UTC). */
  date: string;
  status: AppointmentStatus;
  notes: string | null;
  doctorName: string;
  doctorSpecialty: string;
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

export interface AdminPatientsQuery {
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function getAdminPatients(
  query: AdminPatientsQuery = {},
  signal?: AbortSignal,
): Promise<AdminPatientsPage> {
  const p = new URLSearchParams();
  if (query.q?.trim()) p.set("q", query.q.trim());
  if (query.page && query.page > 1) p.set("page", String(query.page));
  if (query.pageSize) p.set("pageSize", String(query.pageSize));
  const qs = p.toString();
  const res = await fetch(`/api/admin/patients${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as AdminPatientsPage;
}

export async function getPatientAppointments(
  patientId: string,
  signal?: AbortSignal,
): Promise<AdminPatientAppointment[]> {
  const res = await fetch(
    `/api/admin/patients/${patientId}/appointments`,
    { cache: "no-store", signal },
  );
  if (!res.ok) throw await toError(res);
  return (await res.json()) as AdminPatientAppointment[];
}
