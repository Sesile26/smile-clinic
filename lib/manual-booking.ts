/**
 * Manual booking (STAFF/ADMIN record any patient; a doctor records onto their
 * own calendar) — wire types + client fetchers.
 *
 *  • search existing patients          → GET  /api/admin/patients/search?q=
 *  • doctor's free slots (reuses GET /api/slots), grouped by local day
 *  • create the manual appointment     → POST /api/admin/appointments/manual
 *
 * cache: "no-store" everywhere — the SW also denies /api/admin/* and /api/slots
 * (NetworkOnly).
 */

import { getSlots } from "@/lib/booking-client";
import { utcToLocalCell } from "@/lib/booking-time";

export interface ManualPatient {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

/** Canonical UA phone for the new-patient form (+380 + 9 digits). */
export function isValidUaPhone(value: string): boolean {
  return /^\+380\d{9}$/.test(value.replace(/\s/g, ""));
}

/** Error carrying the server's machine code; on a duplicate phone it also
 *  carries the existing patient so the UI can offer to use them. */
export class ManualBookingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public patient?: ManualPatient,
  ) {
    super(message);
    this.name = "ManualBookingError";
  }
}

async function toError(res: Response): Promise<ManualBookingError> {
  let body: { error?: string; code?: string; patient?: ManualPatient } | null = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  return new ManualBookingError(
    body?.code ?? "server",
    body?.error ?? "Сталася помилка. Спробуйте ще раз.",
    res.status,
    body?.patient,
  );
}

export async function searchManualPatients(
  q: string,
  signal?: AbortSignal,
): Promise<ManualPatient[]> {
  const res = await fetch(`/api/admin/patients/search?q=${encodeURIComponent(q)}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ManualPatient[];
}

export interface ManualSlot {
  id: string;
  /** Local "HH:MM". */
  time: string;
}
export interface ManualSlotDay {
  date: Date;
  slots: ManualSlot[];
}

/**
 * The doctor's FREE, future slots for the next 7 days, grouped by local day and
 * sorted. Reuses GET /api/slots (managers receive free+booked; we keep free).
 */
export async function getDoctorFreeSlots(
  doctorId: string,
  today: Date,
  signal?: AbortSignal,
): Promise<ManualSlotDay[]> {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const slots = await getSlots(doctorId, start.toISOString(), end.toISOString(), signal);

  const nowMs = Date.now();
  const byDay = new Map<string, ManualSlotDay>();
  for (const s of slots) {
    if (s.status !== "free" || new Date(s.startsAt).getTime() <= nowMs) continue;
    const { dateKey, time } = utcToLocalCell(s.startsAt);
    const [y, m, d] = dateKey.split("-").map(Number);
    if (!byDay.has(dateKey)) {
      byDay.set(dateKey, { date: new Date(y, m - 1, d), slots: [] });
    }
    byDay.get(dateKey)!.slots.push({ id: s.id, time });
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, day]) => ({
      ...day,
      slots: day.slots.sort((a, b) => (a.time < b.time ? -1 : 1)),
    }));
}

export interface CreateManualInput {
  slotId: string;
  /** Exactly one of these. */
  existingPatientId?: string;
  newPatient?: { name: string; phone: string; email?: string };
}

export interface ManualBookingResult {
  appointmentId: string;
  startsAt: string;
}

export async function createManualBooking(
  input: CreateManualInput,
): Promise<ManualBookingResult> {
  const res = await fetch("/api/admin/appointments/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ManualBookingResult;
}
