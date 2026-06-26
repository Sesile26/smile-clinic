"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  useDoctors,
  useSlots,
  type BookingIdentity,
} from "@/hooks/useBooking";
import { useNotificationSignal } from "@/hooks/useNotificationSignal";
import { AutoRefreshToggle } from "@/components/admin/AutoRefreshToggle";
import { RefreshButton } from "@/components/ui/RefreshButton";
import {
  createSlot,
  deleteSlot,
  fillDay,
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
  dayKey,
  formatMonth,
  formatWeekRange,
  freeCountByDay,
  indexSlots,
  isCellPast,
  manageTimes,
  startOfMonth,
  startOfWeek,
  type SlotStatus,
  type ViewMode,
} from "./data";
import { btnBase, btnMint } from "@/lib/buttons";
import { CalendarToolbar } from "./CalendarToolbar";
import { PendingAppointments } from "./PendingAppointments";
import { WeekCalendar } from "./WeekCalendar";
import { MonthCalendar } from "./MonthCalendar";
import { Select } from "./Select";
import { ConfirmDialog } from "./ConfirmDialog";
import { ManualBookingModal } from "./ManualBookingModal";
import { AppointmentDetailModal } from "./AppointmentDetailModal";
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

/** The only confirmable action left: "Заповнити день". */
type ConfirmState = { kind: "fill"; date: Date; count: number };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
/** "15.06" for a confirm message. */
function shortDate(d: Date): string {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
}
/** uk plural for "слот" (1 слот / 2–4 слоти / 5+ слотів). */
function pluralSlots(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "слот";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "слоти";
  return "слотів";
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

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  // Booked slot whose appointment details are open in the popup.
  const [detailSlotId, setDetailSlotId] = useState<string | null>(null);

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
    fetching: slotsFetching,
    reload,
  } = useSlots({
    doctorId: activeDoctorId ?? null,
    fromISO,
    toISO,
    online,
    enabled: !!activeDoctorId,
  });

  // ── Live updates (existing notifications SSE) ──────────────────────────────
  // New bookings + status changes (cancellations) for the manager's schedule.
  // Auto-applies only when idle (no popup/modal/confirm, no slot action, no
  // focused field); otherwise it counts into an unobtrusive banner so the grid
  // never repaints mid-action.
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [pendingNew, setPendingNew] = useState(0);
  // Bumped to remount PendingAppointments (forces it to refetch its queue).
  const [pendingKey, setPendingKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshSchedule = useCallback(() => {
    reload(); // calendar slots
    setPendingKey((k) => k + 1); // pending queue
    setPendingNew(0);
  }, [reload]);

  const onScheduleSignal = useCallback(() => {
    const active = document.activeElement;
    const interacting =
      !!active &&
      containerRef.current?.contains(active) === true &&
      (active.tagName === "INPUT" ||
        active.tagName === "SELECT" ||
        active.tagName === "TEXTAREA");
    const idle =
      autoRefresh && !busy && !confirm && !manualOpen && !detailSlotId && !interacting;
    if (idle) refreshSchedule();
    else setPendingNew((n) => n + 1);
  }, [autoRefresh, busy, confirm, manualOpen, detailSlotId, refreshSchedule]);

  useNotificationSignal(["appointment_new", "appointment_status"], onScheduleSignal);

  const maps = useMemo(() => indexSlots(slots), [slots]);
  const times = useMemo(() => manageTimes(SLOT_DURATION_MIN), []);
  const week = useMemo(
    () => assembleWeek(weekAnchor, times, maps.statusByCell, today),
    [weekAnchor, times, maps, today],
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
    if (!online || busy || !activeDoctorId) return;
    const date = addDays(weekAnchor, dayIndex);
    if (isCellPast(date, time, today)) return; // no editing/opening past cells
    // Booked → open the appointment-details popup (no slot edit).
    if (status === "booked") {
      const slot = maps.slotByCell.get(cellKeyOf(date, time));
      if (slot) setDetailSlotId(slot.id);
      return;
    }
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

  // Shared wrapper for the async block/unblock/fill calls: busy + error + reload.
  const runAction = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setActionError(null);
    setBusy(true);
    try {
      await fn();
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

  // "Заповнити день": confirm with the count of empty, non-past working hours,
  // then POST /api/slots/fill-day (server skips existing/past hours).
  const onFillDay = (dayIndex: number) => {
    if (!online || busy) return;
    const day = week[dayIndex];
    if (!day) return;
    const count = day.slots.filter((s) => s.status === "off" && !s.past).length;
    if (count === 0) {
      setActionError("Немає порожніх годин для заповнення цього дня.");
      return;
    }
    setActionError(null);
    setConfirm({ kind: "fill", date: day.date, count });
  };

  const applyConfirm = () => {
    if (!confirm || !activeDoctorId) return;
    const c = confirm;
    setConfirm(null);
    void runAction(() => fillDay(activeDoctorId, dayKey(c.date)));
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
    <div ref={containerRef}>
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
                    label: d.specialtyName
                      ? `${d.name} · ${d.specialtyName}`
                      : d.name,
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
              {activeDoctor?.specialtyName && (
                <span className="text-navy-400"> · {activeDoctor.specialtyName}</span>
              )}
            </div>
          </div>
        )}
        <Legend />
      </div>

      {/* Live schedule updates: manual refresh + auto-refresh toggle + banner. */}
      <div className="mb-4 flex items-center justify-end gap-3">
        <RefreshButton onClick={refreshSchedule} busy={slotsFetching} />
        <AutoRefreshToggle
          checked={autoRefresh}
          onChange={() => setAutoRefresh((v) => !v)}
        />
      </div>
      <div aria-live="polite" className="empty:hidden">
        {pendingNew > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-mint-600/30 bg-mint-100/60 px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-sm text-navy-900">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-mint-600"
              />
              {pendingNew === 1
                ? "Оновлення розкладу"
                : `Оновлення розкладу (${pendingNew})`}
            </span>
            <button
              type="button"
              onClick={refreshSchedule}
              className="shrink-0 rounded-full bg-navy-900 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1"
            >
              Оновити
            </button>
          </div>
        )}
      </div>

      {/* Manual booking — record a patient by hand (mock wizard). */}
      {online && activeDoctorId && (
        <div className="mb-5 flex justify-end">
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className={cn(btnBase, btnMint, "px-5 py-2.5 text-sm")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Записати пацієнта
          </button>
        </div>
      )}

      {/* Pending appointments awaiting this doctor's confirm/reject. The key
          remounts it on a live signal so its queue refetches alongside the grid. */}
      <PendingAppointments
        key={pendingKey}
        doctorId={activeDoctorId}
        online={online}
        onChange={reload}
      />

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
          onFillDay={onFillDay}
          bookedActionable={online}
        />
      )}

      {online && view === "week" && activeDoctorId && slotsState === "ready" && (
        <p className="mt-3 text-xs text-navy-400">
          Натисніть порожню годину, щоб відкрити слот, або «працюю», щоб прибрати.
          «Заповнити день» відкриває всі вільні години одразу. Натисніть зайнятий
          слот, щоб переглянути деталі запису.
        </p>
      )}

      {confirm && (
        <ConfirmDialog
          title="Заповнити день"
          message={`Створити ${confirm.count} ${pluralSlots(confirm.count)} на ${shortDate(confirm.date)}?`}
          confirmLabel="Створити"
          cancelLabel="Скасувати"
          onConfirm={applyConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {manualOpen && (
        <ManualBookingModal
          doctors={doctors}
          lockedDoctorId={identity.role === "DOCTOR" ? identity.doctorId : null}
          defaultDoctorId={activeDoctorId}
          today={today}
          onBooked={reload}
          onClose={() => setManualOpen(false)}
        />
      )}

      {detailSlotId && (
        <AppointmentDetailModal
          slotId={detailSlotId}
          online={online}
          canViewPatient
          onClose={() => setDetailSlotId(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function Legend() {
  const items: { label: string; swatch: string }[] = [
    { label: "Працюю", swatch: "border-mint bg-mint-100" },
    { label: "Порожньо", swatch: "border-[color:var(--line-2)] bg-white" },
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
