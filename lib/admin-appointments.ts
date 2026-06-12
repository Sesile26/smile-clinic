/**
 * Wire types + client fetcher for /admin/appointments (STAFF/ADMIN/DOCTOR).
 * Role scope (a DOCTOR sees only their own schedule) is enforced SERVER-SIDE.
 * Confirm/reject reuse the existing booking fetchers (lib/appointments-manage).
 * cache: "no-store" — the SW also denies /api/admin/* (NetworkOnly).
 */

import { ShopApiError } from "@/lib/shop-client";
import type { ApiError } from "@/lib/shop-types";

export type AppointmentStatus = "pending" | "confirmed" | "done" | "cancelled";
export type ApptPeriod = "today" | "week" | "future" | "range";

export const APPT_PAGE_SIZES = [25, 50, 100] as const;
export const APPT_DEFAULT_PAGE_SIZE = 25;

export interface AdminAppointment {
  id: string;
  /** ISO datetime (UTC). */
  date: string;
  status: AppointmentStatus;
  patientName: string;
  patientPhone: string | null;
  doctorId: string;
  doctorName: string;
  /** Specialty name via relation; null when the doctor has none. */
  doctorSpecialty: string | null;
}

export interface AdminAppointmentsPage {
  items: AdminAppointment[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminAppointmentsQuery {
  period?: ApptPeriod;
  /** YYYY-MM-DD (only when period === "range"). */
  from?: string | null;
  to?: string | null;
  /** STAFF/ADMIN only; ignored server-side for a DOCTOR. */
  doctorId?: string | null;
  /** Defaults to pending+confirmed server-side. */
  statuses?: AppointmentStatus[];
  q?: string;
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

export async function getAdminAppointments(
  query: AdminAppointmentsQuery = {},
  signal?: AbortSignal,
): Promise<AdminAppointmentsPage> {
  const p = new URLSearchParams();
  if (query.period) p.set("period", query.period);
  if (query.period === "range") {
    if (query.from) p.set("from", query.from);
    if (query.to) p.set("to", query.to);
  }
  if (query.doctorId) p.set("doctorId", query.doctorId);
  if (query.statuses && query.statuses.length > 0) {
    p.set("status", query.statuses.join(","));
  }
  if (query.q?.trim()) p.set("q", query.q.trim());
  if (query.page && query.page > 1) p.set("page", String(query.page));
  if (query.pageSize) p.set("pageSize", String(query.pageSize));
  const qs = p.toString();
  const res = await fetch(`/api/admin/appointments${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as AdminAppointmentsPage;
}
