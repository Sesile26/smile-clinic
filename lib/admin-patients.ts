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
  /** Specialty name via relation; null when the doctor has none. */
  doctorSpecialty: string | null;
}

export const PATIENT_HISTORY_PAGE_SIZE = 10;

/** One patient's history: ALL upcoming (usually few) + one offset page of past
 *  (newest first). Mirrors /my/appointments. */
export interface AdminPatientHistory {
  upcoming: AdminPatientAppointment[];
  past: {
    items: AdminPatientAppointment[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
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

/** One patient's card (for deep-linking via ?patient=<id>). Throws a
 *  ShopApiError on 403/404 — the caller hides/ignores it (a DOCTOR only ever
 *  resolves their own patients; the server enforces it). */
export async function getAdminPatient(
  id: string,
  signal?: AbortSignal,
): Promise<AdminPatientRow> {
  const res = await fetch(`/api/admin/patients/${id}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as AdminPatientRow;
}

export async function getPatientHistory(
  patientId: string,
  page = 1,
  signal?: AbortSignal,
): Promise<AdminPatientHistory> {
  const qs = page > 1 ? `?page=${page}` : "";
  const res = await fetch(
    `/api/admin/patients/${patientId}/appointments${qs}`,
    { cache: "no-store", signal },
  );
  if (!res.ok) throw await toError(res);
  return (await res.json()) as AdminPatientHistory;
}
