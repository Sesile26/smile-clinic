/**
 * Wire types + client fetchers for the doctor/staff confirm-reject queue.
 * Booking-domain, so it reuses BookingApiError.
 */

import { BookingApiError } from "@/lib/booking-client";
import type { ApiError } from "@/lib/booking-types";

export type ManageApptStatus = "pending" | "confirmed" | "done" | "cancelled";

export interface ManagerAppointment {
  id: string;
  /** UTC ISO. */
  date: string;
  status: ManageApptStatus;
  patientName: string;
  patientPhone: string | null;
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

export async function getPendingAppointments(
  doctorId: string,
  signal?: AbortSignal,
): Promise<ManagerAppointment[]> {
  const qs = new URLSearchParams({ doctorId });
  const res = await fetch(`/api/appointments/pending?${qs.toString()}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ManagerAppointment[];
}

export async function confirmAppointment(id: string): Promise<void> {
  const res = await fetch(`/api/appointments/${id}/confirm`, { method: "PATCH" });
  if (!res.ok) throw await toError(res);
}

export async function rejectAppointment(
  id: string,
  reason?: string,
): Promise<void> {
  const res = await fetch(`/api/appointments/${id}/reject`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reason ? { reason } : {}),
  });
  if (!res.ok) throw await toError(res);
}
