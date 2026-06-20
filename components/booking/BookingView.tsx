"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAppointments } from "@/hooks/useAppointments";
import { useDoctors, useNextFreeSlot, useSlots } from "@/hooks/useBooking";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { createBooking, BookingApiError } from "@/lib/booking-client";
import { utcToLocalCell } from "@/lib/booking-time";
import type { ApiSlot } from "@/lib/booking-types";
import {
  addDays,
  addMonths,
  assembleWeek,
  cellKeyOf,
  formatDayLong,
  formatMonth,
  formatWeekRange,
  freeCountByDay,
  indexSlots,
  isCellPast,
  patientTimes,
  startOfMonth,
  startOfWeek,
  type Doctor,
  type ViewMode,
} from "./data";
import { CalendarToolbar } from "./CalendarToolbar";
import { WeekCalendar } from "./WeekCalendar";
import { MonthCalendar } from "./MonthCalendar";
import { Select } from "./Select";
import { ConfirmModal } from "./ConfirmModal";
import {
  ErrorBanner,
  OfflineNotice,
  SkeletonCalendar,
} from "./StatePanels";

interface BookingViewProps {
  today: Date;
  online: boolean;
}

interface Selection {
  slot: ApiSlot;
  date: Date;
  time: string;
}

/**
 * Patient booking. Shows ONLY the chosen doctor's free slots (server-filtered).
 * Clicking a slot → confirm dialog → POST /api/bookings (atomic). A lost race
 * (slot just taken) is surfaced in the dialog and the grid refetches.
 * Offline: booking is disabled; the patient sees their own mirrored visits.
 */
export function BookingView({ today, online }: BookingViewProps) {
  const [view, setView] = useState<ViewMode>("week");
  const [specialty, setSpecialty] = useState("all");
  const [doctorId, setDoctorId] = useState<string>("");
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(today));
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(today));
  const [selectedDay, setSelectedDay] = useState(0);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const { doctors, state: doctorsState } = useDoctors(online);

  // Unique {id, name} from the roster — by specialtyId, name via relation. Only
  // specialties that actually have a doctor appear (rename shows immediately on
  // the next roster fetch). Doctors with no specialty surface under "Усі".
  const specialties = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of doctors) {
      if (d.specialtyId) seen.set(d.specialtyId, d.specialtyName ?? d.specialtyId);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [doctors]);
  const visibleDoctors = useMemo(
    () =>
      specialty === "all"
        ? doctors
        : doctors.filter((d) => d.specialtyId === specialty),
    [doctors, specialty],
  );

  // Derive the effective doctor instead of syncing state in an effect: if the
  // explicit pick isn't in the current (specialty-filtered) list, fall back to
  // the first available one. No effect → no cascading renders.
  const activeDoctorId = useMemo(() => {
    if (doctorId && visibleDoctors.some((d) => d.id === doctorId)) {
      return doctorId;
    }
    return visibleDoctors[0]?.id ?? "";
  }, [doctorId, visibleDoctors]);

  const doctor: Doctor | undefined = doctors.find((d) => d.id === activeDoctorId);

  // Fetch range follows the active view.
  const { fromISO, toISO } = useMemo(() => {
    if (view === "week") {
      return {
        fromISO: weekAnchor.toISOString(),
        toISO: addDays(weekAnchor, 7).toISOString(),
      };
    }
    const gridStart = startOfWeek(startOfMonth(monthAnchor));
    return {
      fromISO: gridStart.toISOString(),
      toISO: addDays(gridStart, 42).toISOString(),
    };
  }, [view, weekAnchor, monthAnchor]);

  const {
    slots,
    state: slotsState,
    fetching: slotsFetching,
    reload,
  } = useSlots({
    doctorId: activeDoctorId || null,
    fromISO,
    toISO,
    online,
    enabled: !!activeDoctorId,
  });

  const loadingDoctors = doctorsState === "loading" && doctors.length === 0;
  // A (re)fetch is in flight for the chosen doctor/week — covers first load and
  // week/doctor switches. The slot skeleton is gated by an anti-flicker delay so
  // a fast response never flashes it; the calendar shell shows immediately.
  // (Declared before the offline early-return to keep hook order stable.)
  const pending = loadingDoctors || slotsFetching;
  const showSkeletonCells = useDelayedFlag(pending, 200);

  // "Next free time" hint for the chosen doctor (one light query, refetched on
  // doctor change). Declared before the offline early-return (hook order).
  const nextFree = useNextFreeSlot(activeDoctorId || null, online);
  const [highlight, setHighlight] = useState<{ dateKey: string; time: string } | null>(
    null,
  );
  const highlightTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    },
    [],
  );

  const maps = useMemo(() => indexSlots(slots), [slots]);
  const times = useMemo(() => patientTimes(slots), [slots]);
  const week = useMemo(
    () => assembleWeek(weekAnchor, times, maps.statusByCell, today),
    [weekAnchor, times, maps, today],
  );
  const monthCounts = useMemo(() => freeCountByDay(slots), [slots]);
  const hasFreeThisWeek = week.some((d) =>
    d.slots.some((s) => s.status === "working"),
  );

  // ─── Offline: read-only own visits ──────────────────────────────────────────
  if (!online) {
    return <OfflinePatientPanel today={today} />;
  }

  // Changing specialty just narrows the list; activeDoctorId re-derives the
  // fallback doctor automatically.
  const onSpecialtyChange = (value: string) => setSpecialty(value);

  const openConfirm = (dayIndex: number, time: string) => {
    const date = addDays(weekAnchor, dayIndex);
    if (isCellPast(date, time, today)) return; // past slots aren't bookable
    const slot = maps.slotByCell.get(cellKeyOf(date, time));
    if (!slot) return;
    setSelection({ slot, date, time });
    setSuccess(false);
    setBookingError(null);
    setModalOpen(true);
  };

  const confirm = async () => {
    if (!selection) return;
    setSubmitting(true);
    setBookingError(null);
    try {
      await createBooking(selection.slot.id);
      setSuccess(true);
      reload(); // slot disappears from the free list
    } catch (err) {
      if (err instanceof BookingApiError && err.code === "slot_taken") {
        setBookingError("Цей слот щойно зайняли. Оберіть, будь ласка, інший.");
        reload();
      } else if (err instanceof BookingApiError && err.code === "past") {
        setBookingError("Цей час уже минув. Оберіть, будь ласка, інший слот.");
        reload();
      } else if (err instanceof BookingApiError) {
        setBookingError(err.message);
      } else {
        setBookingError("Не вдалося забронювати. Спробуйте ще раз.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const shift = (dir: 1 | -1) => {
    if (view === "week") setWeekAnchor((d) => addDays(d, dir * 7));
    else setMonthAnchor((d) => addMonths(d, dir));
  };
  const goToday = () => {
    setWeekAnchor(startOfWeek(today));
    setMonthAnchor(startOfMonth(today));
  };
  const pickDay = (date: Date) => {
    setWeekAnchor(startOfWeek(date));
    setSelectedDay((date.getDay() + 6) % 7);
    setView("week");
  };

  // Jump to the week of the soonest free slot and flash it. Reuses pickDay's
  // week/day switching; the highlight clears after a few seconds. If the slot is
  // already on the visible week this just (re)flashes it in place.
  const goToNextFree = () => {
    if (!nextFree.slot) return;
    const date = new Date(nextFree.slot.startsAt);
    pickDay(date);
    const cell = utcToLocalCell(nextFree.slot.startsAt);
    setHighlight({ dateKey: cell.dateKey, time: cell.time });
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlight(null), 4000);
  };

  const title =
    view === "week" ? formatWeekRange(weekAnchor) : formatMonth(monthAnchor);

  return (
    <div>
      {/* Specialty + doctor pickers */}
      <div className="mb-5 grid grid-cols-1 gap-4 rounded-xl border border-[color:var(--line)] bg-white p-4 sm:grid-cols-2">
        <Select
          label="Спеціальність"
          value={specialty}
          onChange={onSpecialtyChange}
          options={[
            { value: "all", label: "Усі спеціальності" },
            ...specialties.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <Select
          label="Лікар"
          value={activeDoctorId}
          onChange={setDoctorId}
          options={
            visibleDoctors.length
              ? visibleDoctors.map((d) => ({ value: d.id, label: d.name }))
              : [{ value: "", label: "Немає лікарів" }]
          }
        />
      </div>

      {/* "Next free time" hint for the chosen doctor. Hidden when no doctor or
          on error (the calendar still works). */}
      {activeDoctorId && nextFree.state !== "error" && (
        <NextFreeHint state={nextFree.state} startsAt={nextFree.slot?.startsAt} onJump={goToNextFree} />
      )}

      <CalendarToolbar
        view={view}
        onViewChange={setView}
        title={title}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onToday={goToday}
      />

      <div aria-busy={pending || undefined}>
        {doctorsState === "error" ? (
          // Roster failed → there's no calendar to show at all.
          <ErrorBanner onRetry={() => window.location.reload()} />
        ) : view === "month" ? (
          slotsState === "error" ? (
            <ErrorBanner onRetry={reload} />
          ) : pending ? (
            <SkeletonCalendar />
          ) : (
            <MonthCalendar
              monthAnchor={monthAnchor}
              freeCountByDay={monthCounts}
              today={today}
              onPickDay={pickDay}
            />
          )
        ) : (
          // Week view: the frame (day headers/dates + the grid shell) ALWAYS
          // renders — only the inner slot zone swaps between loading / slots /
          // empty / error, so switching weeks never drops the dates or jumps.
          <WeekCalendar
            week={week}
            mode="book"
            today={today}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            onActivate={(dayIndex, time) => openConfirm(dayIndex, time)}
            bodyState={
              slotsState === "error"
                ? "error"
                : pending
                  ? "loading"
                  : hasFreeThisWeek
                    ? "ready"
                    : "empty"
            }
            cellsVisible={showSkeletonCells}
            emptyTitle="Немає вільних місць на цей тиждень"
            emptyHint={`У ${doctor?.name ?? "обраного лікаря"} немає вільних слотів цього тижня. Спробуйте інший період або іншого лікаря.`}
            onRetry={reload}
            highlight={highlight}
          />
        )}
      </div>

      {!pending && slotsState === "ready" && view === "week" && hasFreeThisWeek && (
        <p className="mt-3 text-xs text-navy-400">
          Оберіть вільний слот, щоб перейти до підтвердження запису.
        </p>
      )}

      <ConfirmModal
        open={modalOpen}
        success={success}
        submitting={submitting}
        error={bookingError}
        doctor={doctor ?? null}
        date={selection?.date ?? null}
        time={selection?.time ?? null}
        onConfirm={confirm}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

/**
 * "Next free time" hint: a small line above the calendar. When a slot is found
 * it's a button that jumps to (and flashes) that slot. Loading and "none" are
 * shown distinctly; the error case is hidden by the parent.
 */
function NextFreeHint({
  state,
  startsAt,
  onJump,
}: {
  state: "loading" | "found" | "none" | "error";
  startsAt?: string;
  onJump: () => void;
}) {
  if (state === "loading") {
    return (
      <p className="mb-3 flex items-center gap-2 text-sm text-navy-400" aria-live="polite">
        <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-mint" />
        Шукаємо найближчий вільний час…
      </p>
    );
  }
  if (state === "none") {
    return (
      <p className="mb-3 text-sm text-navy-400" aria-live="polite">
        Немає вільних слотів найближчим часом.
      </p>
    );
  }
  if (state !== "found" || !startsAt) return null;

  const d = new Date(startsAt);
  const time = utcToLocalCell(startsAt).time;
  return (
    <button
      type="button"
      onClick={onJump}
      className="group mb-3 inline-flex items-center gap-2 rounded-full border border-mint/60 bg-mint-100/60 px-3.5 py-2 text-sm text-navy-900 transition-colors hover:border-mint hover:bg-mint-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1"
    >
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="text-mint-600">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span>
        Найближчий вільний час:{" "}
        <span className="font-medium">
          {formatDayLong(d)}, {time}
        </span>
      </span>
      <span aria-hidden="true" className="text-navy-400 transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </button>
  );
}

/**
 * Offline patient view: booking needs a connection, so we show a banner plus
 * the patient's own mirrored upcoming visits (read-only).
 */
function OfflinePatientPanel({ today }: { today: Date }) {
  const appointments = useAppointments();
  const startMs = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();

  const upcoming = appointments
    .filter(
      (a) => a.status !== "cancelled" && new Date(a.date).getTime() >= startMs,
    )
    .slice(0, 20);

  return (
    <div>
      <OfflineNotice className="mb-4" />
      <div className="rounded-xl border border-[color:var(--line)] bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-navy-900">Ваші візити</h2>
        {upcoming.length === 0 ? (
          <p className="py-8 text-center text-sm text-navy-400">
            Немає збережених майбутніх записів для перегляду офлайн.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-[color:var(--line)] px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-navy-900">
                    {a.doctorName}
                  </div>
                  {a.doctorSpecialty && (
                    <div className="text-xs text-navy-400">
                      {a.doctorSpecialty}
                    </div>
                  )}
                </div>
                <div className="text-right text-sm tabular-nums text-navy-700">
                  {formatDayLong(new Date(a.date))}
                  <br />
                  <span className="text-navy-400">
                    {new Date(a.date).toLocaleTimeString("uk-UA", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
