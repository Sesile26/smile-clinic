/**
 * Wire types shared by the booking API (server) and the /booking client.
 * Times are always UTC ISO strings on the wire.
 */

export type ApiSlotStatus = "free" | "booked";

export interface ApiSlot {
  id: string;
  doctorId: string;
  /** UTC ISO. */
  startsAt: string;
  /** UTC ISO. */
  endsAt: string;
  status: ApiSlotStatus;
}

/** The doctor's soonest bookable slot (status=free, startsAt >= now), or null
 *  when they have none upcoming. One light lookup — drives the "next free time"
 *  hint without paging through weeks. */
export interface NextFreeSlot {
  id: string;
  /** UTC ISO. */
  startsAt: string;
}

export interface ApiDoctor {
  id: string;
  name: string;
  /** FK to Specialty — the booking filter matches on this id (null = "Без
   *  спеціальності"). The denormalized name below is for display only. */
  specialtyId: string | null;
  specialtyName: string | null;
}

/** Stable error codes the UI branches on (status text is for humans). */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "not_found"
  | "slot_taken" // booking lost the race
  | "slot_busy" // tried to delete a booked slot
  | "overlap" // new slot overlaps an existing one
  | "duplicate" // a slot already exists at that exact start
  | "past" // slot start is in the past
  | "limit" // too many active appointments
  | "rate_limited" // too many booking attempts in a short window
  | "server";

export interface ApiError {
  error: string;
  code: ApiErrorCode;
}
