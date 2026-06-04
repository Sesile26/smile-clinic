"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  DOCTORS,
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
  type SlotDuration,
  type SlotStatus,
  type ViewMode,
} from "./data";
import { CalendarToolbar } from "./CalendarToolbar";
import { WeekCalendar } from "./WeekCalendar";
import { MonthCalendar } from "./MonthCalendar";
import { Select } from "./Select";
import { EmptyState, ErrorBanner, SkeletonCalendar } from "./StatePanels";

interface ManageViewProps {
  today: Date;
  demoState: DemoState;
  onRetry: () => void;
}

/**
 * Mode A — doctor/admin slot management.
 * Toggling a free slot marks "я працюю" (mint); booked slots are locked.
 * Slot edits live in `overrides`, keyed by doctor+date+time so they survive
 * week/month navigation without a backend.
 */
export function ManageView({ today, demoState, onRetry }: ManageViewProps) {
  const [view, setView] = useState<ViewMode>("week");
  const [duration, setDuration] = useState<SlotDuration>(30);
  const [doctorId, setDoctorId] = useState(DOCTORS[0].id);
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(today));
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(today));
  const [selectedDay, setSelectedDay] = useState(0);
  // override key → "off" | "working"
  const [overrides, setOverrides] = useState<Record<string, SlotStatus>>({});

  const doctor = DOCTORS.find((d) => d.id === doctorId) ?? DOCTORS[0];

  // Week with edits applied. Booked is immutable; otherwise an override wins.
  const week: DaySlots[] = useMemo(() => {
    const base = buildWeek(doctorId, weekAnchor, duration);
    return base.map((day) => ({
      date: day.date,
      slots: day.slots.map((s) => {
        if (s.status === "booked") return s;
        const k = `${doctorId}|${dayKey(day.date)}|${s.time}`;
        return { time: s.time, status: overrides[k] ?? s.status };
      }),
    }));
  }, [doctorId, weekAnchor, duration, overrides]);

  const toggleSlot = (dayIndex: number, time: string, status: SlotStatus) => {
    if (status === "booked") return;
    const date = addDays(weekAnchor, dayIndex);
    const k = `${doctorId}|${dayKey(date)}|${time}`;
    setOverrides((prev) => ({
      ...prev,
      [k]: status === "working" ? "off" : "working",
    }));
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

  const title = view === "week" ? formatWeekRange(weekAnchor) : formatMonth(monthAnchor);

  return (
    <div>
      {/* Doctor picker (admin) */}
      <div className="mb-5 flex flex-col gap-4 rounded-xl border border-[color:var(--line)] bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        <Select
          label="Оберіть лікаря"
          value={doctorId}
          onChange={setDoctorId}
          options={DOCTORS.map((d) => ({
            value: d.id,
            label: `${d.name} · ${d.specialty}`,
          }))}
          className="sm:max-w-[360px] sm:flex-1"
        />
        <Legend />
      </div>

      <CalendarToolbar
        view={view}
        onViewChange={setView}
        title={title}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onToday={goToday}
        duration={duration}
        onDurationChange={setDuration}
      />

      {demoState === "loading" ? (
        <SkeletonCalendar />
      ) : demoState === "error" ? (
        <ErrorBanner onRetry={onRetry} />
      ) : demoState === "empty" ? (
        <EmptyState
          title="Розклад порожній"
          hint={`У ${doctor.name} ще немає налаштованих слотів на цей період.`}
        />
      ) : view === "week" ? (
        <WeekCalendar
          week={week}
          mode="manage"
          today={today}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onActivate={toggleSlot}
        />
      ) : (
        <MonthCalendar
          monthAnchor={monthAnchor}
          doctorId={doctorId}
          duration={duration}
          today={today}
          onPickDay={pickDay}
        />
      )}
    </div>
  );
}

function Legend() {
  const items: { label: string; swatch: string }[] = [
    { label: "Працюю", swatch: "border-mint bg-mint-100" },
    { label: "Не працюю", swatch: "border-[color:var(--line-2)] bg-white" },
    { label: "Зайнято", swatch: "border-navy-900/15 bg-navy-900/[0.06]" },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-navy-700">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("h-3.5 w-3.5 rounded border", it.swatch)}
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
