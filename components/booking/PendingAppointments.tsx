"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  confirmAppointment,
  getPendingAppointments,
  rejectAppointment,
  type ManagerAppointment,
} from "@/lib/appointments-manage";
import { BookingApiError } from "@/lib/booking-client";
import { formatClinicDateTime } from "@/lib/clinic-time";

interface PendingAppointmentsProps {
  doctorId: string | null;
  online: boolean;
  /** Called after a reject frees a slot, so the calendar can refetch. */
  onChange?: () => void;
}

type State = "loading" | "ready" | "error";

function fmt(iso: string): string {
  return formatClinicDateTime(iso);
}

/**
 * Confirm/reject queue for the active doctor — pending appointments awaiting a
 * decision. Online-only (actions hit the API); hidden offline. Role/ownership
 * is enforced server-side; this is just the manager's UI.
 */
export function PendingAppointments({
  doctorId,
  online,
  onChange,
}: PendingAppointmentsProps) {
  const [items, setItems] = useState<ManagerAppointment[]>([]);
  const [state, setState] = useState<State>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!online || !doctorId) return;
    const ac = new AbortController();
    getPendingAppointments(doctorId, ac.signal)
      .then((rows) => {
        setItems(rows);
        setState("ready");
      })
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setState("error");
      });
    return () => ac.abort();
  }, [doctorId, online, reloadKey]);

  // Offline / no doctor → nothing to manage here (calendar shows the rest).
  if (!online || !doctorId) return null;

  const act = async (
    id: string,
    fn: (id: string) => Promise<void>,
    freesSlot: boolean,
  ) => {
    setBusyId(id);
    setError(null);
    try {
      await fn(id);
      setItems((prev) => prev.filter((a) => a.id !== id));
      if (freesSlot) onChange?.();
    } catch (err) {
      setError(
        err instanceof BookingApiError
          ? err.message
          : "Не вдалося оновити запис.",
      );
      setReloadKey((k) => k + 1); // resync on failure
    } finally {
      setBusyId(null);
    }
  };

  // While loading or when empty, stay quiet — no clutter above the calendar.
  if (state === "loading" || (state === "ready" && items.length === 0)) {
    return null;
  }

  return (
    <section
      aria-label="Записи на підтвердження"
      className="mb-5 rounded-xl border border-amber-300/60 bg-amber-50/50 p-4"
    >
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-navy-900">
        Записи на підтвердження
        {state === "ready" && (
          <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-xs font-medium tabular-nums text-amber-800">
            {items.length}
          </span>
        )}
      </h2>

      {state === "error" ? (
        <p className="text-sm text-red-700">
          Не вдалося завантажити записи на підтвердження.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-3 rounded-lg border border-[color:var(--line)] bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-navy-900">
                  {fmt(a.date)}
                </div>
                <div className="text-xs text-navy-400">
                  {a.patientName}
                  {a.patientPhone && (
                    <span className="tabular-nums"> · {a.patientPhone}</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busyId === a.id}
                  onClick={() => act(a.id, confirmAppointment, false)}
                  className={cn(
                    "rounded-full bg-mint px-3.5 py-1.5 text-sm font-medium text-navy-900 transition-colors hover:bg-mint-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1",
                    busyId === a.id && "opacity-60",
                  )}
                >
                  Підтвердити
                </button>
                <button
                  type="button"
                  disabled={busyId === a.id}
                  onClick={() => act(a.id, (id) => rejectAppointment(id), true)}
                  className={cn(
                    "rounded-full border border-[color:var(--line-2)] px-3.5 py-1.5 text-sm font-medium text-navy-900 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400",
                    busyId === a.id && "opacity-60",
                  )}
                >
                  Відхилити
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
