"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scroll-lock";
import { btnBase, btnGhost, btnMint } from "@/lib/buttons";
import { IcoClose } from "@/components/icons";
import { Select } from "./Select";
import { SlotButton } from "./SlotButton";
import { formatDayLong, WEEKDAYS_SHORT } from "./data";
import {
  createManualBooking,
  getDoctorFreeSlots,
  isValidUaPhone,
  searchManualPatients,
  ManualBookingError,
  type ManualPatient,
  type ManualSlotDay,
} from "@/lib/manual-booking";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const fieldInput =
  "w-full rounded-lg border border-[color:var(--line-2)] bg-white py-2.5 px-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]";
const fieldLabel = "text-xs font-medium tracking-[0.04em] text-navy-700";
const fieldError = "text-xs text-red-500";

export interface ManualBookingDoctor {
  id: string;
  name: string;
  specialtyName: string | null;
}

interface ManualBookingModalProps {
  /** Real doctor roster (read-only) for the staff/admin picker. */
  doctors: ManualBookingDoctor[];
  /** Doctor role → lock the picker to themselves. */
  lockedDoctorId?: string | null;
  /** Staff/admin → preselect the calendar's active doctor. */
  defaultDoctorId?: string | null;
  today: Date;
  onClose: () => void;
  /** Called after a successful booking so the calendar can refetch. */
  onBooked?: () => void;
}

type Step = 1 | 2 | 3 | "done";
type PatientMode = "existing" | "new";

const STEPS: { n: 1 | 2 | 3; label: string }[] = [
  { n: 1, label: "Пацієнт" },
  { n: 2, label: "Лікар і час" },
  { n: 3, label: "Підтвердження" },
];

/**
 * Manual-booking wizard — STAFF/ADMIN record any patient; a doctor records onto
 * their own calendar. Three steps in one focus-trapped dialog:
 *   1. pick patient — existing (live search) OR new card (no account);
 *   2. pick doctor (locked for a doctor user) + a real free slot;
 *   3. review → "Записати" → POST /api/admin/appointments/manual → success.
 * The appointment is created CONFIRMED; the calendar refetches via onBooked.
 */
export function ManualBookingModal({
  doctors,
  lockedDoctorId,
  defaultDoctorId,
  today,
  onClose,
  onBooked,
}: ManualBookingModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>(1);

  // Step 1 — patient
  const [mode, setMode] = useState<PatientMode>("existing");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ManualPatient[]>([]);
  const [searching, setSearching] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<ManualPatient | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("+380");
  const [newEmail, setNewEmail] = useState("");
  const [touched, setTouched] = useState(false);

  // Step 2 — doctor + time
  const initialDoctor = lockedDoctorId ?? defaultDoctorId ?? doctors[0]?.id ?? "";
  const [doctorId, setDoctorId] = useState(initialDoctor);
  const [days, setDays] = useState<ManualSlotDay[] | null>(initialDoctor ? null : []);
  const [slotsError, setSlotsError] = useState(false);
  const [dayIdx, setDayIdx] = useState(0);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [slotsKey, setSlotsKey] = useState(0);

  // State resets live in event handlers (not the fetch effect) so we never call
  // setState synchronously inside an effect.
  const pickDoctor = (id: string) => {
    setDoctorId(id);
    setDays(null);
    setSlotsError(false);
    setDayIdx(0);
    setSlotId(null);
  };
  const reloadSlots = () => {
    setDays(null);
    setSlotsError(false);
    setSlotId(null);
    setSlotsKey((k) => k + 1);
  };

  // Step 3 — submit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phoneConflict, setPhoneConflict] = useState<ManualPatient | null>(null);

  const lockedDoctor = lockedDoctorId
    ? doctors.find((d) => d.id === lockedDoctorId) ?? null
    : null;

  // ── Focus trap + scroll lock ──────────────────────────────────────────────
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    lockBodyScroll();
    const t = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }, 50);
    return () => {
      window.clearTimeout(t);
      unlockBodyScroll();
      prev?.focus?.();
    };
  }, [step]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const list = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((el) => el.offsetParent !== null);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  // ── Live patient search (existing mode), debounced + abortable ─────────────
  useEffect(() => {
    if (mode !== "existing") return;
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      setSearching(true);
      searchManualPatients(query, ac.signal)
        .then((rows) => {
          setResults(rows);
          setSearching(false);
        })
        .catch((err) => {
          if (ac.signal.aborted || err?.name === "AbortError") return;
          setResults([]);
          setSearching(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [mode, query]);

  // ── Free slots for the chosen doctor (no synchronous setState in the body —
  //    loading/reset is done in pickDoctor/reloadSlots above) ────────────────
  useEffect(() => {
    if (!doctorId) return;
    const ac = new AbortController();
    getDoctorFreeSlots(doctorId, today, ac.signal)
      .then((d) => setDays(d))
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setDays([]);
        setSlotsError(true);
      });
    return () => ac.abort();
  }, [doctorId, today, slotsKey]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const newPhoneValid = isValidUaPhone(newPhone);
  const newEmailValid =
    newEmail.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());
  const newValid = newName.trim().length >= 2 && newPhoneValid && newEmailValid;

  const step1Valid = mode === "existing" ? !!selectedPatient : newValid;
  const step2Valid = !!slotId;

  let selectedSlot: { id: string; time: string; date: Date } | null = null;
  if (days && slotId) {
    for (const d of days) {
      const s = d.slots.find((x) => x.id === slotId);
      if (s) {
        selectedSlot = { ...s, date: d.date };
        break;
      }
    }
  }

  const doctorName = lockedDoctor
    ? lockedDoctor.name
    : doctors.find((d) => d.id === doctorId)?.name ?? "—";
  const patientName =
    mode === "existing" ? selectedPatient?.name ?? "—" : newName.trim();
  const patientPhone =
    mode === "existing" ? selectedPatient?.phone ?? "—" : newPhone.trim();

  const goNext = () => {
    if (step === 1) {
      setTouched(true);
      if (step1Valid) setStep(2);
    } else if (step === 2) {
      if (step2Valid) setStep(3);
    }
  };
  const goBack = () => setStep((s) => (s === 3 ? 2 : 1));

  // ── Submit ────────────────────────────────────────────────────────────────
  const book = async (override?: { existingPatientId: string }) => {
    if (!slotId || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setPhoneConflict(null);
    try {
      if (override) {
        await createManualBooking({ slotId, existingPatientId: override.existingPatientId });
      } else if (mode === "existing") {
        await createManualBooking({ slotId, existingPatientId: selectedPatient!.id });
      } else {
        await createManualBooking({
          slotId,
          newPatient: {
            name: newName.trim(),
            phone: newPhone.trim(),
            email: newEmail.trim() || undefined,
          },
        });
      }
      onBooked?.();
      setStep("done");
    } catch (e) {
      if (e instanceof ManualBookingError) {
        if (e.code === "phone_exists" && e.patient) {
          setPhoneConflict(e.patient);
          setSubmitError(e.message);
        } else if (e.code === "slot_taken" || e.code === "past") {
          // The slot was taken / passed — go back to re-pick, refresh slots.
          setSubmitError("Цей слот уже недоступний. Оберіть інший час.");
          reloadSlots();
          setStep(2);
        } else {
          setSubmitError(e.message);
        }
      } else {
        setSubmitError("Не вдалося створити запис. Спробуйте ще раз.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep(1);
    setMode("existing");
    setQuery("");
    setSelectedPatient(null);
    setNewName("");
    setNewPhone("+380");
    setNewEmail("");
    setTouched(false);
    setDoctorId(initialDoctor);
    reloadSlots();
    setSubmitError(null);
    setPhoneConflict(null);
  };

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[110] grid place-items-center bg-[rgba(10,22,40,0.55)] p-4 backdrop-blur-[10px]"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manualBookingTitle"
        className="relative flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-s3"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] px-6 py-4">
          <div>
            <h2 id="manualBookingTitle" className="font-serif text-[22px] leading-none tracking-[-0.01em] text-navy-900">
              Записати пацієнта
            </h2>
            {step !== "done" && <StepIndicator step={step} />}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-navy-400 transition-colors hover:bg-cream hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
          >
            <IcoClose size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 overflow-y-auto scrollbar-none px-6 py-5">
          {step === 1 && (
            <PatientStep
              mode={mode}
              onMode={(m) => {
                setMode(m);
                setSubmitError(null);
              }}
              query={query}
              onQuery={setQuery}
              results={results}
              searching={searching}
              selectedId={selectedPatient?.id ?? null}
              onSelectPatient={setSelectedPatient}
              newName={newName}
              onNewName={setNewName}
              newPhone={newPhone}
              onNewPhone={setNewPhone}
              newEmail={newEmail}
              onNewEmail={setNewEmail}
              touched={touched}
              newPhoneValid={newPhoneValid}
              newEmailValid={newEmailValid}
            />
          )}

          {step === 2 && (
            <DoctorTimeStep
              doctors={doctors}
              lockedDoctor={lockedDoctor}
              doctorId={doctorId}
              onDoctor={pickDoctor}
              days={days}
              slotsError={slotsError}
              onRetrySlots={reloadSlots}
              dayIdx={dayIdx}
              onDay={setDayIdx}
              slotId={slotId}
              onSlot={setSlotId}
            />
          )}

          {step === 3 && (
            <ReviewStep
              patientName={patientName}
              patientPhone={patientPhone}
              isNew={mode === "new"}
              doctorName={doctorName}
              dateLabel={selectedSlot ? formatDayLong(selectedSlot.date) : "—"}
              time={selectedSlot?.time ?? "—"}
              error={submitError}
              phoneConflict={phoneConflict}
              onUseExisting={(id) => book({ existingPatientId: id })}
              busy={submitting}
            />
          )}

          {step === "done" && (
            <DoneStep
              patientName={patientName}
              doctorName={doctorName}
              dateLabel={selectedSlot ? formatDayLong(selectedSlot.date) : "—"}
              time={selectedSlot?.time ?? "—"}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2.5 border-t border-[color:var(--line)] px-6 py-4">
          {step === "done" ? (
            <>
              <button type="button" onClick={reset} className={cn(btnBase, btnGhost, "flex-1 justify-center")}>
                Записати ще одного
              </button>
              <button type="button" data-autofocus onClick={onClose} className={cn(btnBase, btnMint, "flex-1 justify-center")}>
                Готово
              </button>
            </>
          ) : (
            <>
              {step !== 1 ? (
                <button type="button" onClick={goBack} disabled={submitting} className={cn(btnBase, btnGhost, "justify-center disabled:opacity-50")}>
                  Назад
                </button>
              ) : (
                <button type="button" onClick={onClose} className={cn(btnBase, btnGhost, "justify-center")}>
                  Скасувати
                </button>
              )}
              <div className="flex-1" />
              {step === 3 ? (
                <button
                  type="button"
                  onClick={() => book()}
                  disabled={submitting}
                  className={cn(btnBase, btnMint, "justify-center disabled:cursor-not-allowed disabled:opacity-50")}
                >
                  {submitting ? "Запис…" : "Записати"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
                  className={cn(btnBase, btnMint, "justify-center disabled:cursor-not-allowed disabled:opacity-50")}
                >
                  Далі
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-navy-400">
      {STEPS.map((s, i) => (
        <li key={s.n} className="flex items-center gap-1.5">
          <span
            className={cn(
              "grid h-5 w-5 place-items-center rounded-full tabular-nums",
              s.n === step
                ? "bg-navy-900 text-white"
                : s.n < step
                  ? "bg-mint text-navy-900"
                  : "bg-cream text-navy-400",
            )}
          >
            {s.n}
          </span>
          <span className={cn(s.n === step && "text-navy-900")}>{s.label}</span>
          {i < STEPS.length - 1 && <span aria-hidden="true" className="px-0.5 text-navy-400/50">›</span>}
        </li>
      ))}
    </ol>
  );
}

// ─── Step 1: patient ────────────────────────────────────────────────────────

function PatientStep({
  mode,
  onMode,
  query,
  onQuery,
  results,
  searching,
  selectedId,
  onSelectPatient,
  newName,
  onNewName,
  newPhone,
  onNewPhone,
  newEmail,
  onNewEmail,
  touched,
  newPhoneValid,
  newEmailValid,
}: {
  mode: PatientMode;
  onMode: (m: PatientMode) => void;
  query: string;
  onQuery: (v: string) => void;
  results: ManualPatient[];
  searching: boolean;
  selectedId: string | null;
  onSelectPatient: (p: ManualPatient) => void;
  newName: string;
  onNewName: (v: string) => void;
  newPhone: string;
  onNewPhone: (v: string) => void;
  newEmail: string;
  onNewEmail: (v: string) => void;
  touched: boolean;
  newPhoneValid: boolean;
  newEmailValid: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Тип пацієнта" className="inline-flex w-full rounded-full border border-[color:var(--line-2)] bg-white p-0.5">
        <ModeTab active={mode === "existing"} onClick={() => onMode("existing")} label="Наявний пацієнт" />
        <ModeTab active={mode === "new"} onClick={() => onMode("new")} label="Новий пацієнт" />
      </div>

      {mode === "existing" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mb-search" className={fieldLabel}>Пошук пацієнта</label>
            <input
              id="mb-search"
              data-autofocus
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Імʼя або телефон"
              className={fieldInput}
            />
          </div>
          {searching ? (
            <p className="px-1 py-4 text-center text-sm text-navy-400" aria-live="polite">Пошук…</p>
          ) : results.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[color:var(--line-2)] bg-cream/40 px-4 py-6 text-center text-sm text-navy-400">
              Нічого не знайдено. Спробуйте інший запит або створіть нового пацієнта.
            </p>
          ) : (
            <ul role="radiogroup" aria-label="Результати пошуку" className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto">
              {results.map((p) => {
                const selected = p.id === selectedId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onSelectPatient(p)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                        selected
                          ? "border-mint bg-mint-100"
                          : "border-[color:var(--line-2)] bg-white hover:border-navy-900",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-navy-900">{p.name}</span>
                        <span className="block truncate text-xs tabular-nums text-navy-400">{p.phone ?? "—"}</span>
                      </span>
                      {selected && <span aria-hidden="true" className="text-xs font-medium text-mint-600">обрано</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mb-name" className={fieldLabel}>Імʼя пацієнта *</label>
            <input
              id="mb-name"
              data-autofocus
              type="text"
              value={newName}
              onChange={(e) => onNewName(e.target.value)}
              placeholder="Напр. Марія Іваненко"
              className={fieldInput}
              aria-invalid={touched && newName.trim().length < 2}
            />
            {touched && newName.trim().length < 2 && (
              <span className={fieldError}>Вкажіть імʼя (мін. 2 символи).</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mb-phone" className={fieldLabel}>Телефон *</label>
            <input
              id="mb-phone"
              type="tel"
              inputMode="tel"
              value={newPhone}
              onChange={(e) => onNewPhone(e.target.value)}
              placeholder="+380XXXXXXXXX"
              className={fieldInput}
              aria-invalid={touched && !newPhoneValid}
            />
            {touched && !newPhoneValid && (
              <span className={fieldError}>Формат: +380 та 9 цифр.</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mb-email" className={fieldLabel}>Email (опційно)</label>
            <input
              id="mb-email"
              type="email"
              value={newEmail}
              onChange={(e) => onNewEmail(e.target.value)}
              placeholder="name@example.com"
              className={fieldInput}
              aria-invalid={touched && !newEmailValid}
            />
            {touched && !newEmailValid && (
              <span className={fieldError}>Невалідний email.</span>
            )}
          </div>
          <p className="rounded-lg bg-cream/60 px-3.5 py-2.5 text-xs text-navy-700">
            Запис без реєстрації, лише картка пацієнта — акаунт не створюється.
          </p>
        </div>
      )}
    </div>
  );
}

function ModeTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex-1 rounded-full px-3 py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
        active ? "bg-navy-900 text-white" : "text-navy-700 hover:text-navy-900",
      )}
    >
      {label}
    </button>
  );
}

// ─── Step 2: doctor + time ────────────────────────────────────────────────────

function DoctorTimeStep({
  doctors,
  lockedDoctor,
  doctorId,
  onDoctor,
  days,
  slotsError,
  onRetrySlots,
  dayIdx,
  onDay,
  slotId,
  onSlot,
}: {
  doctors: ManualBookingDoctor[];
  lockedDoctor: ManualBookingDoctor | null;
  doctorId: string;
  onDoctor: (id: string) => void;
  days: ManualSlotDay[] | null;
  slotsError: boolean;
  onRetrySlots: () => void;
  dayIdx: number;
  onDay: (i: number) => void;
  slotId: string | null;
  onSlot: (id: string) => void;
}) {
  const currentDay = days?.[dayIdx];
  const doctorHasSlots = !!days && days.some((d) => d.slots.length > 0);
  return (
    <div className="flex flex-col gap-4">
      {lockedDoctor ? (
        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Лікар</span>
          <div className="rounded-lg border border-[color:var(--line-2)] bg-cream/40 px-3.5 py-2.5 text-sm font-medium text-navy-900">
            {lockedDoctor.name}
            {lockedDoctor.specialtyName && (
              <span className="font-normal text-navy-400"> · {lockedDoctor.specialtyName}</span>
            )}
          </div>
        </div>
      ) : (
        <Select
          label="Лікар"
          value={doctorId}
          onChange={onDoctor}
          options={
            doctors.length
              ? doctors.map((d) => ({
                  value: d.id,
                  label: d.specialtyName ? `${d.name} · ${d.specialtyName}` : d.name,
                }))
              : [{ value: "", label: "Немає лікарів" }]
          }
        />
      )}

      {slotsError ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center">
          <p className="text-sm text-red-700">Не вдалося завантажити слоти.</p>
          <button type="button" onClick={onRetrySlots} className="rounded-full bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
            Спробувати знову
          </button>
        </div>
      ) : days === null ? (
        <p className="px-1 py-8 text-center text-sm text-navy-400" aria-live="polite">Завантаження вільних слотів…</p>
      ) : !doctorHasSlots ? (
        <p className="rounded-lg border border-dashed border-[color:var(--line-2)] bg-cream/40 px-4 py-8 text-center text-sm text-navy-400">
          У цього лікаря немає вільних слотів найближчими днями.
        </p>
      ) : (
        <>
          <div role="tablist" aria-label="Оберіть день" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {days.map((d, i) => {
              const active = i === dayIdx;
              return (
                <button
                  key={d.date.toISOString()}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onDay(i)}
                  className={cn(
                    "flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                    active
                      ? "border-navy-900 bg-navy-900 text-white"
                      : "border-[color:var(--line-2)] bg-white text-navy-700",
                  )}
                >
                  <span className="text-[11px] font-medium">{WEEKDAYS_SHORT[(d.date.getDay() + 6) % 7]}</span>
                  <span className="text-sm font-medium tabular-nums">{d.date.getDate()}</span>
                  <span className={cn("text-[10px] tabular-nums", active ? "text-white/70" : "text-navy-400")}>
                    {d.slots.length} вільн.
                  </span>
                </button>
              );
            })}
          </div>

          {!currentDay || currentDay.slots.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[color:var(--line-2)] bg-cream/40 px-4 py-6 text-center text-sm text-navy-400">
              Немає вільних слотів цього дня. Оберіть інший день.
            </p>
          ) : (
            <div role="group" aria-label="Вільний час" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {currentDay.slots.map((s) => (
                <SlotButton
                  key={s.id}
                  time={s.time}
                  variant={slotId === s.id ? "selected" : "free"}
                  onClick={() => onSlot(s.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Step 3: review ───────────────────────────────────────────────────────────

function ReviewStep({
  patientName,
  patientPhone,
  isNew,
  doctorName,
  dateLabel,
  time,
  error,
  phoneConflict,
  onUseExisting,
  busy,
}: {
  patientName: string;
  patientPhone: string;
  isNew: boolean;
  doctorName: string;
  dateLabel: string;
  time: string;
  error: string | null;
  phoneConflict: ManualPatient | null;
  onUseExisting: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="divide-y divide-[color:var(--line)] rounded-xl border border-[color:var(--line)] bg-cream/40">
        <Row term="Пацієнт" value={isNew ? `${patientName} (нова картка)` : patientName} />
        <Row term="Телефон" value={patientPhone || "—"} />
        <Row term="Лікар" value={doctorName} />
        <Row term="Дата" value={dateLabel} />
        <Row term="Час" value={time} />
      </dl>
      <p className="rounded-lg bg-cream/60 px-3.5 py-2.5 text-xs text-navy-700">
        Ручний запис підтверджується одразу — підтвердження пацієнта не потрібне.
      </p>

      {error && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
          <span>{error}</span>
          {phoneConflict && (
            <button
              type="button"
              onClick={() => onUseExisting(phoneConflict.id)}
              disabled={busy}
              className="self-start rounded-full bg-navy-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:opacity-50"
            >
              Записати наявного: {phoneConflict.name}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-xs text-navy-400">{term}</dt>
      <dd className="text-right text-sm font-medium text-navy-900">{value}</dd>
    </div>
  );
}

// ─── Done ─────────────────────────────────────────────────────────────────────

function DoneStep({
  patientName,
  doctorName,
  dateLabel,
  time,
}: {
  patientName: string;
  doctorName: string;
  dateLabel: string;
  time: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-mint-100 text-mint-600">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <h3 className="font-serif text-xl text-navy-900">Пацієнта записано</h3>
      <p className="text-sm text-navy-700">
        <span className="font-medium">{patientName}</span> — до {doctorName},<br />
        {dateLabel}, {time}. Статус: <span className="font-medium text-navy-900">підтверджено</span>.
      </p>
    </div>
  );
}
