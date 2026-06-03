"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type LocalAppointment } from "@/lib/db";

/**
 * Read-only Dexie reader for the mirrored appointment slice.
 *
 * Writes (booking, cancelling) are NOT handled here — they remain online-
 * only and go through dedicated /api/appointments endpoints in the calling
 * component. Keeping the offline path strictly read-only avoids time-slot
 * conflicts and double-booking races on shared calendars.
 *
 * The mirror is populated by useMirror() (mounted in SessionProvider) and
 * wiped on signOut by Header.handleSignOut.
 */
export function useAppointments(): LocalAppointment[] {
  const appointments = useLiveQuery(
    () => db.appointments.orderBy("date").toArray(),
    [],
    [] as LocalAppointment[],
  );
  return appointments;
}
