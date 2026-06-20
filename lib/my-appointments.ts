/**
 * Wire types + client fetchers for the patient's own appointments
 * (/my/appointments). Booking-domain, so it reuses BookingApiError.
 * cache: "no-store" — the SW also denies /api/my/* (NetworkOnly).
 */

import { BookingApiError } from "@/lib/booking-client";
import type { ApiError } from "@/lib/booking-types";

export type MyApptStatus = "pending" | "confirmed" | "done" | "cancelled";

export interface MyAppointment {
  id: string;
  /** UTC ISO instant. Displayed in local time on the client. */
  date: string;
  status: MyApptStatus;
  doctorName: string;
  /** Specialty name via relation; null when the doctor has none. */
  doctorSpecialty: string | null;
}

/** Default page size for the history (past) section. */
export const PAST_PAGE_SIZE = 10;

/** One load of /my/appointments: ALL upcoming + one page of history. */
export interface MyAppointmentsPage {
  /** Active (pending/confirmed) visits dated now-or-later — always full. */
  upcoming: MyAppointment[];
  /** History (everything else) — offset-paginated, newest first. */
  past: {
    items: MyAppointment[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

async function toError(res: Response): Promise<BookingApiError> {
  let body: Partial<ApiError> | null = null;
  try {
    body = (await res.json()) as ApiError;
  } catch {
    /* non-JSON */
  }
  return new BookingApiError(
    body?.code ?? "server",
    body?.error ?? "Сталася помилка. Спробуйте ще раз.",
    res.status,
  );
}

export async function getMyAppointments(
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<MyAppointmentsPage> {
  const sp = new URLSearchParams();
  if (page > 1) sp.set("page", String(page));
  if (pageSize !== PAST_PAGE_SIZE) sp.set("pageSize", String(pageSize));
  const qs = sp.toString();
  const res = await fetch(`/api/my/appointments${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as MyAppointmentsPage;
}

export async function cancelMyAppointment(id: string): Promise<MyAppointment> {
  const res = await fetch(`/api/my/appointments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "cancelled" }),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as MyAppointment;
}
