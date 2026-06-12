"use client";

import type { AppointmentStatus, LocalAppointment } from "@/lib/db";

interface AppointmentCardProps {
  appointment: LocalAppointment;
  /**
   * Online-only "cancel" action wired by the parent (e.g. a dashboard page).
   * Optional because the mirrored offline view often won't have a network
   * path for it.
   */
  onCancel?: (id: string) => void;
}

const statusStyles: Record<AppointmentStatus, string> = {
  pending: "bg-yellow-500/15 text-yellow-300 ring-yellow-500/40",
  confirmed: "bg-mint/15 text-mint ring-mint/40",
  done: "bg-green-500/15 text-green-300 ring-green-500/40",
  cancelled: "bg-red-500/15 text-red-300 ring-red-500/40",
};

const statusLabel: Record<AppointmentStatus, string> = {
  pending: "очікує",
  confirmed: "підтверджено",
  done: "завершено",
  cancelled: "скасовано",
};

function formatDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("uk-UA", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export function AppointmentCard({ appointment, onCancel }: AppointmentCardProps) {
  const { id, patientName, doctorName, doctorSpecialty, date, notes, status } =
    appointment;
  const { date: dateText, time } = formatDate(date);
  const isFinal = status === "done" || status === "cancelled";

  return (
    <article className="rounded-xl border border-white/10 bg-[#0A1628] p-4 text-white shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{patientName}</h3>
          <p className="mt-0.5 truncate text-sm text-white/60">
            {doctorName}
            {doctorSpecialty ? ` · ${doctorSpecialty}` : ""}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${statusStyles[status]}`}
        >
          {statusLabel[status]}
        </span>
      </header>

      <div className="mt-3 flex items-center gap-3 text-sm text-white/80">
        <time dateTime={date}>{dateText}</time>
        <span aria-hidden="true" className="text-white/30">
          ·
        </span>
        <span>{time}</span>
      </div>

      {notes && (
        <p className="mt-2 line-clamp-2 text-sm text-white/60">{notes}</p>
      )}

      {onCancel && !isFinal && (
        <footer className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onCancel(id)}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A1628]"
          >
            Скасувати
          </button>
        </footer>
      )}
    </article>
  );
}
