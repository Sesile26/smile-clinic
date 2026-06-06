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

export interface ApiDoctor {
  id: string;
  name: string;
  specialty: string;
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
  | "server";

export interface ApiError {
  error: string;
  code: ApiErrorCode;
}
