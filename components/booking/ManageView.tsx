"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  useDoctors,
  useSlots,
  type BookingIdentity,
} from "@/hooks/useBooking";
import {
  createSlot,
  deleteSlot,
  BookingApiError,
} from "@/lib/booking-client";
import {
  cellEndUtcISO,
  cellToUtcISO,
  SLOT_DURATION_MIN,
} from "@/lib/booking-time";
import {
  addDays,
  addMonths,
  assembleWeek,
  cellKeyOf,
  formatMonth,
  formatWeekRange,
  freeCountByDay,
  indexSlots,
  manageTimes,
  startOfMonth,
  startOfWeek,
  type SlotStatus,
  type ViewMode,
} from "./data";
import { CalendarToolbar } from "./CalendarToolbar";
import { WeekCalendar } from "./WeekCalendar";
import { MonthCalendar } from "./MonthCalendar";
import { Select } from "./Select";
import {
  EmptyState,
  ErrorBanner,
  OfflineNotice,
  SkeletonCalendar,
} from "./StatePanels";

interface ManageViewProps {
  today: Date;
  identity: BookingIdentity;
  online: boolean;
}

/**
 * Slot management for DOCTOR / STAFF / ADMIN.
 *  • DOCTOR is locked to their own Doctor row (no picker).
 *  • STAFF/ADMIN pick whose calendar to edit.
 * Toggling an empty cell POSTs a free slot; toggling a free cell DELETEs it;
 * booked cells are locked. Offline → read-only mirror, edits disabled.
 */
export function ManageView({ today, identity, online }: ManageViewProps) {
  const isStaffAdmin = identity.role === "STAFF" || identity.role === "ADMIN";

  const [view, setView] = useState<ViewMode>("week");
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(today));
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(today));
  const [selectedDay, setSelectedDay] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { doctors, state: doctorsState } = useDoctors(online);

  // DOCTOR → own doctor row; STAFF/ADMIN → the picked one, derived (with a
  // first-doctor fallback) so we never sync state inside an effect.
  const activeDoctorId = useMemo(() => {
    if (!isStaffAdmin) return identity.doctorId;
    if (selectedDoctorId && doctors.some((d) => d.id === selectedDoctorId)) {
      return selectedDoctorId;
    }
    return doctors[0]?.id ?? null;
  }, [isStaffAdmin, identity.doctorId, selectedDoctorId, doctors]);
  const activeDoctor = doctors.find((d) => d.id === activeDoctorId);

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
    doctorId: activeDoctorId ?? null,
    fromISO,
    toISO,
    online,
    enabled: !!activeDoctorId,
  });

  const maps = useMemo(() => indexSlots(slots), [slots]);
  const times = useMemo(() => manageTimes(SLOT_DURATION_MIN), []);
  const week = useMemo(
    () => assembleWeek(weekAnchor, times, maps.statusByCell),
    [weekAnchor, times, maps],
  );
  const monthCounts = useMemo(() => freeCountByDay(slots), [slots]);

  // DOCTOR role with no linked Doctor row yet.
  if (identity.role === "DOCTOR" && !identity.doctorId) {
    return (
      <EmptyState
        title="Акаунт лікаря не привʼязаний"
        hint="Ваш акаунт має роль «лікар», але ще не зв’язаний із карткою лікаря. Зверніться до адміністратора, щоб отримати доступ до керування розкладом."
      />
    );
  }

  const toggleSlot = async (
    dayIndex: number,
    time: string,
    status: SlotStatus,
  ) => {
    if (!online || busy || !activeDoctorId || status === "booked") return;
    const date = addDays(weekAnchor, dayIndex);
    setActionError(null);
    setBusy(true);
    try {
      if (status === "working") {
        const slot = maps.slotByCell.get(cellKeyOf(date, time));
        if (slot) await deleteSlot(slot.id);
      } else {
        await createSlot(
          activeDoctorId,
          cellToUtcISO(date, time),
          cellEndUtcISO(date, time, SLOT_DURATION_MIN),
        );
      }
      reload();
    } catch (err) {
      setActionError(
        err instanceof BookingApiError
          ? err.message
          : "Не вдалося оновити розклад. Спробуйте ще раз.",
      );
      reload();
    } finally {
      setBusy(false);
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

  const showSkeleton =
    (isStaffAdmin && doctorsState === "loading" && doctors.length === 0) ||
    slotsState === "loading";

  return (
    <div>
      {/* Doctor scope + legend */}
      <div className="mb-5 flex flex-col gap-4 rounded-xl border border-[color:var(--line)] bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        {isStaffAdmin ? (
          <Select
            label="Оберіть лікаря"
            value={activeDoctorId ?? ""}
            onChange={setSelectedDoctorId}
            options={
              doctors.length
                ? doctors.map((d) => ({
                    value: d.id,
                    label: `${d.name} · ${d.specialty}`,
                  }))
                : [{ value: "", label: "Немає лікарів" }]
            }
            className="sm:max-w-[360px] sm:flex-1"
          />
        ) : (
          <div className="sm:flex-1">
            <div className="text-xs font-medium tracking-[0.04em] text-navy-700">
              Ваш розклад
            </div>
            <div className="mt-1 text-sm font-medium text-navy-900">
              {activeDoctor?.name ?? "—"}
              {activeDoctor?.specialty && (
                <span className="text-navy-400"> · {activeDoctor.specialty}</span>
              )}
            </div>
          </div>
        )}
        <Legend />
      </div>

      {!online && (
        <OfflineNotice
          className="mb-4"
          message={
            <>
              Ви офлайн. Розклад показано лише для перегляду —{" "}
              <strong className="font-medium">
                зміни доступні лише онлайн
              </strong>
              .
            </>
          }
        />
      )}

      <CalendarToolbar
        view={view}
        onViewChange={setView}
        title={title}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onToday={goToday}
      />

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      {isStaffAdmin && doctorsState === "error" ? (
        <ErrorBanner onRetry={() => window.location.reload()} />
      ) : showSkeleton ? (
        <SkeletonCalendar />
      ) : slotsState === "error" ? (
        <ErrorBanner onRetry={reload} />
      ) : !activeDoctorId ? (
        <EmptyState title="Оберіть лікаря" hint="Виберіть лікаря, щоб побачити та редагувати його розклад." />
      ) : view === "month" ? (
        <MonthCalendar
          monthAnchor={monthAnchor}
          freeCountByDay={monthCounts}
          today={today}
          onPickDay={pickDay}
        />
      ) : (
        <WeekCalendar
          week={week}
          mode="manage"
          disabled={!online}
          today={today}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onActivate={toggleSlot}
        />
      )}

      {online && view === "week" && activeDoctorId && slotsState === "ready" && (
        <p className="mt-3 text-xs text-navy-400">
          Натисніть на вільну клітинку, щоб позначити «працюю», або на мітку
          «працюю», щоб прибрати. Заброньовані слоти заблоковані.
        </p>
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
