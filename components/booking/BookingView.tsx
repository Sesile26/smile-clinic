"use client";

import { useMemo, useState } from "react";
import { useAppointments } from "@/hooks/useAppointments";
import { useDoctors, useSlots } from "@/hooks/useBooking";
import { createBooking, BookingApiError } from "@/lib/booking-client";
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
  EmptyState,
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

  const specialties = useMemo(
    () => [...new Set(doctors.map((d) => d.specialty))],
    [doctors],
  );
  const visibleDoctors = useMemo(
    () =>
      specialty === "all"
        ? doctors
        : doctors.filter((d) => d.specialty === specialty),
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
    reload,
  } = useSlots({
    doctorId: activeDoctorId || null,
    fromISO,
    toISO,
    online,
    enabled: !!activeDoctorId,
  });

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

  const title =
    view === "week" ? formatWeekRange(weekAnchor) : formatMonth(monthAnchor);

  const loadingDoctors = doctorsState === "loading" && doctors.length === 0;
  const showSkeleton = loadingDoctors || slotsState === "loading";

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
            ...specialties.map((s) => ({ value: s, label: s })),
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

      <CalendarToolbar
        view={view}
        onViewChange={setView}
        title={title}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onToday={goToday}
      />

      {doctorsState === "error" ? (
        <ErrorBanner onRetry={() => window.location.reload()} />
      ) : showSkeleton ? (
        <SkeletonCalendar />
      ) : slotsState === "error" ? (
        <ErrorBanner onRetry={reload} />
      ) : view === "month" ? (
        <MonthCalendar
          monthAnchor={monthAnchor}
          freeCountByDay={monthCounts}
          today={today}
          onPickDay={pickDay}
        />
      ) : !hasFreeThisWeek ? (
        <EmptyState
          title="Немає вільних слотів"
          hint={`У ${doctor?.name ?? "обраного лікаря"} немає вільних слотів на цей тиждень. Спробуйте інший період або іншого лікаря.`}
        />
      ) : (
        <WeekCalendar
          week={week}
          mode="book"
          today={today}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onActivate={(dayIndex, time) => openConfirm(dayIndex, time)}
        />
      )}

      {slotsState === "ready" && view === "week" && hasFreeThisWeek && (
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
                  <div className="text-xs text-navy-400">
                    {a.doctorSpecialty}
                  </div>
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
