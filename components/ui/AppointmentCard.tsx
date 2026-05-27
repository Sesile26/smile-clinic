"use client";

import type { LocalAppointment } from "@/lib/db";

interface AppointmentCardProps {
  appointment: LocalAppointment;
  onDelete: (id: string) => void;
  onSync: (id: string) => void;
}

const statusStyles: Record<LocalAppointment["status"], string> = {
  pending: "bg-yellow-500/15 text-yellow-300 ring-yellow-500/40",
  synced: "bg-green-500/15 text-green-300 ring-green-500/40",
  failed: "bg-red-500/15 text-red-300 ring-red-500/40",
};

export function AppointmentCard({
  appointment,
  onDelete,
  onSync,
}: AppointmentCardProps) {
  const { id, patientName, doctorName, date, time, notes, status } =
    appointment;

  return (
    <article className="rounded-xl border border-white/10 bg-[#0A1628] p-4 text-white shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{patientName}</h3>
          <p className="mt-0.5 truncate text-sm text-white/60">
            Dr. {doctorName}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${statusStyles[status]}`}
        >
          {status}
        </span>
      </header>

      <div className="mt-3 flex items-center gap-3 text-sm text-white/80">
        <time>{date}</time>
        <span aria-hidden="true" className="text-white/30">
          ·
        </span>
        <span>{time}</span>
      </div>

      {notes && (
        <p className="mt-2 line-clamp-2 text-sm text-white/60">{notes}</p>
      )}

      {status === "pending" && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-yellow-300/90">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-400" />
          Waiting to sync
        </p>
      )}

      <footer className="mt-4 flex items-center justify-end gap-2">
        {status !== "synced" && (
          <button
            type="button"
            onClick={() => onSync(id)}
            className="rounded-md bg-[#00C9A7] px-3 py-1.5 text-xs font-medium text-[#0A1628] hover:bg-[#00C9A7]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00C9A7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A1628]"
          >
            Sync
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(id)}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A1628]"
        >
          Delete
        </button>
      </footer>
    </article>
  );
}
