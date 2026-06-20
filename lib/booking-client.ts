/**
 * Client-side fetch wrappers for the booking API. Each throws a
 * {@link BookingApiError} (carrying the server's machine code) on failure so
 * callers can branch on `slot_taken`, `overlap`, etc.
 *
 * cache: "no-store" everywhere — the SW also denies these routes (NetworkOnly),
 * but this is belt-and-braces so we never read a stale free slot.
 */

import type {
  ApiDoctor,
  ApiError,
  ApiErrorCode,
  ApiSlot,
  BookedSlotDetail,
  NextFreeSlot,
} from "@/lib/booking-types";

export class BookingApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "BookingApiError";
  }
}

async function toError(res: Response): Promise<BookingApiError> {
  let body: Partial<ApiError> | null = null;
  try {
    body = (await res.json()) as ApiError;
  } catch {
    /* non-JSON error body */
  }
  return new BookingApiError(
    body?.code ?? "server",
    body?.error ?? "Сталася помилка. Спробуйте ще раз.",
    res.status,
  );
}

export async function getDoctors(): Promise<ApiDoctor[]> {
  const res = await fetch("/api/doctors", { cache: "no-store" });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ApiDoctor[];
}

export async function getSlots(
  doctorId: string,
  fromISO: string,
  toISO: string,
  signal?: AbortSignal,
): Promise<ApiSlot[]> {
  const qs = new URLSearchParams({ doctorId, from: fromISO, to: toISO });
  const res = await fetch(`/api/slots?${qs.toString()}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ApiSlot[];
}

export async function getNextFreeSlot(
  doctorId: string,
  signal?: AbortSignal,
): Promise<NextFreeSlot | null> {
  const qs = new URLSearchParams({ doctorId });
  const res = await fetch(`/api/slots/next-free?${qs.toString()}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as NextFreeSlot | null;
}

export async function getBookedSlotDetail(
  slotId: string,
  signal?: AbortSignal,
): Promise<BookedSlotDetail> {
  const res = await fetch(`/api/slots/${slotId}/appointment`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as BookedSlotDetail;
}

export async function createSlot(
  doctorId: string,
  startsAt: string,
  endsAt: string,
): Promise<ApiSlot> {
  const res = await fetch("/api/slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doctorId, startsAt, endsAt }),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ApiSlot;
}

/** Open every empty working hour of a local day (YYYY-MM-DD). Returns the count
 *  actually created (existing/past hours are skipped server-side). */
export async function fillDay(
  doctorId: string,
  date: string,
): Promise<{ created: number }> {
  const res = await fetch("/api/slots/fill-day", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doctorId, date }),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as { created: number };
}

/** Delete a free slot (remove availability). Booked slots are protected
 *  server-side. */
export async function deleteSlot(id: string): Promise<void> {
  const res = await fetch("/api/slots", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok && res.status !== 204) throw await toError(res);
}

export async function createBooking(
  slotId: string,
): Promise<{ appointmentId: string; startsAt: string }> {
  const res = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slotId }),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as { appointmentId: string; startsAt: string };
}

export async function cancelBooking(appointmentId: string): Promise<void> {
  const res = await fetch("/api/bookings", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appointmentId }),
  });
  if (!res.ok) throw await toError(res);
}
