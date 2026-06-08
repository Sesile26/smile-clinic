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
  doctorSpecialty: string;
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
  signal?: AbortSignal,
): Promise<MyAppointment[]> {
  const res = await fetch("/api/my/appointments", { cache: "no-store", signal });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as MyAppointment[];
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
