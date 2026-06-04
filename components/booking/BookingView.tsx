"use client";

import { useMemo, useState } from "react";
import {
  DOCTORS,
  SPECIALTIES,
  addDays,
  addMonths,
  buildWeek,
  dayKey,
  formatMonth,
  formatWeekRange,
  startOfMonth,
  startOfWeek,
  type DaySlots,
  type DemoState,
  type Doctor,
  type SlotStatus,
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
  demoState: DemoState;
  /** Effective connectivity (real status AND demo override). */
  online: boolean;
  onRetry: () => void;
}

const PATIENT_DURATION = 30; // patients always book in 30-min slots (mock)

interface Selection {
  dayIndex: number;
  date: Date;
  time: string;
}

/**
 * Mode B — patient booking. Shows ONLY the chosen doctor's free slots.
 * Clicking a slot opens a confirm dialog; confirming flips local mock state to
 * "booked" and shows the success screen. Offline → read-only + disabled CTA.
 */
export function BookingView({ today, demoState, online, onRetry }: BookingViewProps) {
  const [view, setView] = useState<ViewMode>("week");
  const [specialty, setSpecialty] = useState("all");
  const [doctorId, setDoctorId] = useState(DOCTORS[0].id);
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(today));
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(today));
  const [selectedDay, setSelectedDay] = useState(0);
  // Slots the patient booked this session → removed from the free list.
  const [booked, setBooked] = useState<Set<string>>(() => new Set());

  const [selection, setSelection] = useState<Selection | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [success, setSuccess] = useState(false);

  const visibleDoctors =
    specialty === "all"
      ? DOCTORS
      : DOCTORS.filter((d) => d.specialty === specialty);

  const doctor: Doctor =
    visibleDoctors.find((d) => d.id === doctorId) ?? visibleDoctors[0] ?? DOCTORS[0];

  // Week of free slots; anything the patient just booked becomes "booked" so
  // book-mode rendering drops it from the grid.
  const week: DaySlots[] = useMemo(() => {
    const base = buildWeek(doctor.id, weekAnchor, PATIENT_DURATION);
    return base.map((day) => ({
      date: day.date,
      slots: day.slots.map((s) => {
        const k = `${doctor.id}|${dayKey(day.date)}|${s.time}`;
        if (booked.has(k)) return { time: s.time, status: "booked" as SlotStatus };
        return s;
      }),
    }));
  }, [doctor.id, weekAnchor, booked]);

  const hasFreeThisWeek = week.some((d) =>
    d.slots.some((s) => s.status === "working"),
  );

  const onSpecialtyChange = (value: string) => {
    setSpecialty(value);
    const next =
      value === "all" ? DOCTORS : DOCTORS.filter((d) => d.specialty === value);
    if (next.length && !next.some((d) => d.id === doctorId)) {
      setDoctorId(next[0].id);
    }
  };

  const openConfirm = (dayIndex: number, time: string) => {
    if (!online) return;
    setSelection({ dayIndex, date: addDays(weekAnchor, dayIndex), time });
    setSuccess(false);
    setModalOpen(true);
  };

  const confirm = () => {
    if (!selection) return;
    const k = `${doctor.id}|${dayKey(selection.date)}|${selection.time}`;
    setBooked((prev) => new Set(prev).add(k));
    setSuccess(true);
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
            ...SPECIALTIES.map((s) => ({ value: s, label: s })),
          ]}
        />
        <Select
          label="Лікар"
          value={doctor.id}
          onChange={setDoctorId}
          options={visibleDoctors.map((d) => ({ value: d.id, label: d.name }))}
        />
      </div>

      {!online && demoState === "ready" && <OfflineNotice className="mb-4" />}

      <CalendarToolbar
        view={view}
        onViewChange={setView}
        title={title}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onToday={goToday}
      />

      {demoState === "loading" ? (
        <SkeletonCalendar />
      ) : demoState === "error" ? (
        <ErrorBanner onRetry={onRetry} />
      ) : demoState === "empty" || (view === "week" && !hasFreeThisWeek) ? (
        <EmptyState
          title="Немає вільних слотів"
          hint={`У ${doctor.name} немає вільних слотів на цей тиждень. Спробуйте інший період або іншого лікаря.`}
        />
      ) : view === "week" ? (
        <WeekCalendar
          week={week}
          mode="book"
          disabled={!online}
          today={today}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onActivate={(dayIndex, time) => openConfirm(dayIndex, time)}
        />
      ) : (
        <MonthCalendar
          monthAnchor={monthAnchor}
          doctorId={doctor.id}
          duration={PATIENT_DURATION}
          today={today}
          onPickDay={pickDay}
        />
      )}

      {/* Connectivity / availability footnote */}
      {demoState === "ready" && view === "week" && hasFreeThisWeek && (
        <p className="mt-3 text-xs text-navy-400">
          {online
            ? "Оберіть вільний слот, щоб перейти до підтвердження запису."
            : "Бронювання доступне лише онлайн. Зараз можна лише переглядати розклад."}
        </p>
      )}

      <ConfirmModal
        open={modalOpen}
        success={success}
        doctor={doctor}
        date={selection?.date ?? null}
        time={selection?.time ?? null}
        onConfirm={confirm}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
