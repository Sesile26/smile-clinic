"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { cn } from "@/lib/cn";
import { loginSchema, type LoginValues } from "@/schemas/login";
import {
  IcoArrow,
  IcoClose,
  IcoClock,
  IcoGoogle,
  IcoId,
  IcoLock,
  IcoMail,
  IcoShield,
  IcoTooth,
} from "@/components/icons";

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

type SubmitStatus = "idle" | "submitting" | "success";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const fieldInput =
  "w-full rounded-lg border border-[color:var(--line-2)] bg-white py-[13px] pl-10 pr-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]";

export function LoginModal({ open, onClose }: LoginModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const patientTabRef = useRef<HTMLButtonElement>(null);
  const staffTabRef = useRef<HTMLButtonElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [pill, setPill] = useState<{ left: number; width: number }>({
    left: 4,
    width: 0,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      mode: "patient",
      staffId: "",
      email: "",
      password: "",
      remember: false,
    },
  });

  const mode = watch("mode");
  const isStaff = mode === "staff";

  const measurePill = useCallback(() => {
    const active = isStaff ? staffTabRef.current : patientTabRef.current;
    const parent = tabsRef.current;
    if (!active || !parent) return;
    const a = active.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    setPill({ left: a.left - p.left, width: a.width });
  }, [isStaff]);

  // Reposition the tab pill when mode changes, modal opens, or window resizes.
  useLayoutEffect(() => {
    if (open) measurePill();
  }, [open, mode, measurePill]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => measurePill();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, measurePill]);

  // Open/close side effects: scroll lock, autofocus, reset, restore focus.
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    setStatus("idle");
    setShowPw(false);

    const focusTimer = window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLInputElement>('input[name="email"]')
        ?.focus();
    }, 400);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, [open]);

  // Keyboard: Escape closes, Tab is trapped within the dialog.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusables || focusables.length === 0) return;

      const list = Array.from(focusables).filter(
        (el) => el.offsetParent !== null,
      );
      if (list.length === 0) return;

      const first = list[0];
      const last = list[list.length - 1];
      const activeEl = document.activeElement;

      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  const switchMode = (next: "patient" | "staff") => {
    setValue("mode", next, { shouldValidate: false });
  };

  const onValid = (values: LoginValues) => {
    // No auth backend yet — simulate the mockup's submit feedback.
    // TODO: wire to authService.login() once available.
    void values;
    setStatus("submitting");
    window.setTimeout(() => {
      setStatus("success");
      window.setTimeout(() => {
        reset({
          mode,
          staffId: "",
          email: "",
          password: "",
          remember: false,
        });
        onClose();
      }, 900);
    }, 900);
  };

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
      className={cn(
        "fixed inset-0 z-[100] grid place-items-center p-6 backdrop-blur-[10px] transition-[opacity,visibility] duration-300 ease-smooth",
        "bg-[rgba(10,22,40,0.55)]",
        open ? "visible opacity-100" : "invisible opacity-0",
      )}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="loginTitle"
        className={cn(
          "grid w-full max-w-[880px] grid-cols-1 overflow-hidden rounded-lg bg-white shadow-s3 transition-transform duration-[450ms] ease-smooth lg:max-w-[880px] lg:grid-cols-2",
          open ? "translate-y-0 scale-100" : "translate-y-5 scale-[0.98]",
        )}
      >
        {/* Aside (hidden on small screens, per mockup) */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(160deg,#0F1E36_0%,#0A1628_100%)] p-11 text-white lg:flex">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(500px_300px_at_100%_0%,rgba(0,201,167,0.22),transparent_60%)]"
          />
          <div className="relative flex items-center gap-2.5 font-serif text-[22px]">
            <span className="relative grid h-[30px] w-[30px] place-items-center rounded-full bg-white">
              <IcoTooth size={16} className="text-navy-900" />
            </span>
            SmileClinic
          </div>
          <div className="relative">
            <h2
              id="loginTitle"
              className="mb-3 font-serif text-[38px] leading-[1.1] tracking-[-0.02em]"
            >
              З поверненням до вашої <em className="italic text-mint">посмішки</em>.
            </h2>
            <p className="m-0 max-w-[32ch] text-sm leading-[1.55] text-white/60">
              Особистий кабінет з історією візитів, рекомендаціями лікаря та
              можливістю записатися у два кліки.
            </p>
          </div>
          <div className="relative flex gap-[18px] text-xs text-white/45">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2.5 py-1.5">
              <IcoShield size={12} className="text-mint" /> SSL · Захищено
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2.5 py-1.5">
              <IcoClock size={12} className="text-mint" /> 24/7 доступ
            </span>
          </div>
        </aside>

        {/* Body */}
        <div className="relative flex flex-col p-11 max-[1024px]:p-7">
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-navy-400 transition-colors duration-200 hover:bg-cream hover:text-navy-900"
          >
            <IcoClose size={18} />
          </button>

          {/* Tabs */}
          <div
            ref={tabsRef}
            role="tablist"
            className="relative mb-7 inline-flex self-start rounded-full bg-cream p-1"
          >
            <span
              aria-hidden="true"
              className="absolute bottom-1 top-1 rounded-full bg-white shadow-[0_2px_8px_rgba(10,22,40,0.08)] transition-[left,width] duration-[350ms] ease-smooth"
              style={{ left: pill.left, width: pill.width }}
            />
            <button
              ref={patientTabRef}
              type="button"
              role="tab"
              aria-selected={!isStaff}
              onClick={() => switchMode("patient")}
              className={cn(
                "relative z-[2] rounded-full px-[22px] py-2.5 text-[13px] font-medium transition-colors duration-200",
                isStaff ? "text-navy-400" : "text-navy-900",
              )}
            >
              Пацієнт
            </button>
            <button
              ref={staffTabRef}
              type="button"
              role="tab"
              aria-selected={isStaff}
              onClick={() => switchMode("staff")}
              className={cn(
                "relative z-[2] rounded-full px-[22px] py-2.5 text-[13px] font-medium transition-colors duration-200",
                isStaff ? "text-navy-900" : "text-navy-400",
              )}
            >
              Персонал
            </button>
          </div>

          <h3 className="m-0 mb-2 font-serif text-[28px] leading-[1.15] tracking-[-0.015em] text-navy-900">
            {isStaff ? (
              <>
                Робочий <em className="italic text-mint-600">кабінет</em>.
              </>
            ) : (
              <>
                Вітаємо, <em className="italic text-mint-600">пацієнте</em>.
              </>
            )}
          </h3>
          <p className="m-0 mb-7 text-sm text-navy-400">
            {isStaff
              ? "Вхід для лікарів та адміністраторів клініки."
              : "Увійдіть, щоб переглянути історію візитів та керувати записами."}
          </p>

          <form onSubmit={handleSubmit(onValid)} noValidate>
            <input type="hidden" {...register("mode")} />

            {isStaff && (
              <div className="relative mb-4 flex flex-col gap-1.5">
                <label
                  htmlFor="staffId"
                  className="text-xs font-medium tracking-[0.04em] text-navy-700"
                >
                  ID співробітника
                </label>
                <div className="relative flex items-center">
                  <IcoId
                    size={16}
                    className="pointer-events-none absolute left-3.5 text-navy-400"
                  />
                  <input
                    id="staffId"
                    placeholder="SC-0000"
                    autoComplete="off"
                    className={fieldInput}
                    {...register("staffId")}
                  />
                </div>
                {errors.staffId && (
                  <span className="text-xs text-red-500">
                    {errors.staffId.message}
                  </span>
                )}
              </div>
            )}

            <div className="relative mb-4 flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-xs font-medium tracking-[0.04em] text-navy-700"
              >
                Email
              </label>
              <div className="relative flex items-center">
                <IcoMail
                  size={16}
                  className="pointer-events-none absolute left-3.5 text-navy-400"
                />
                <input
                  id="email"
                  type="email"
                  placeholder="ім’я@smileclinic.ua"
                  autoComplete="email"
                  className={fieldInput}
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <span className="text-xs text-red-500">
                  {errors.email.message}
                </span>
              )}
            </div>

            <div className="relative mb-4 flex flex-col gap-1.5">
              <label
                htmlFor="pw"
                className="text-xs font-medium tracking-[0.04em] text-navy-700"
              >
                Пароль
              </label>
              <div className="relative flex items-center">
                <IcoLock
                  size={16}
                  className="pointer-events-none absolute left-3.5 text-navy-400"
                />
                <input
                  id="pw"
                  type={showPw ? "text" : "password"}
                  placeholder="Введіть пароль"
                  autoComplete="current-password"
                  className={cn(fieldInput, "pr-20")}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 rounded-md p-1.5 text-xs text-navy-400 transition-colors hover:text-navy-900"
                >
                  {showPw ? "Сховати" : "Показати"}
                </button>
              </div>
              {errors.password && (
                <span className="text-xs text-red-500">
                  {errors.password.message}
                </span>
              )}
            </div>

            <div className="my-1 mb-6 flex items-center justify-between">
              <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-navy-400">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-mint-600"
                  {...register("remember")}
                />
                Запам’ятати мене
              </label>
              <a href="#" className="text-[13px] font-medium text-navy-900 hover:text-mint-600">
                Забули пароль?
              </a>
            </div>

            <button
              type="submit"
              disabled={status !== "idle"}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2.5 rounded-lg py-3.5 text-[15px] font-medium text-white transition-[background,transform] duration-200 hover:-translate-y-px",
                status === "success"
                  ? "bg-mint-600"
                  : "bg-navy-900 hover:bg-black",
                status === "submitting" && "opacity-80",
              )}
            >
              {status === "submitting" && "Перевіряємо…"}
              {status === "success" && "✓ Вітаємо!"}
              {status === "idle" && (
                <>
                  Увійти
                  <IcoArrow size={16} />
                </>
              )}
            </button>

            {!isStaff && (
              <>
                <div className="my-[22px] flex items-center gap-3 text-xs uppercase tracking-[0.08em] text-navy-400 before:h-px before:flex-1 before:bg-[color:var(--line)] after:h-px after:flex-1 after:bg-[color:var(--line)]">
                  або
                </div>
                <button
                  type="button"
                  onClick={() => signIn("google")}
                  className="inline-flex w-full items-center justify-center gap-2.5 rounded-lg border border-[color:var(--line-2)] bg-white px-3.5 py-3 text-sm font-medium text-navy-900 transition-colors hover:bg-cream"
                >
                  <IcoGoogle size={18} />
                  Продовжити з Google
                </button>
              </>
            )}

            <p className="mt-[22px] text-center text-[13px] text-navy-400">
              {isStaff ? (
                <>
                  Проблеми зі входом?{" "}
                  <a
                    href="#"
                    className="border-b border-[color:var(--line-2)] font-medium text-navy-900 hover:border-mint-600 hover:text-mint-600"
                  >
                    Зв’язатись з IT
                  </a>
                </>
              ) : (
                <>
                  Ще не маєте акаунту?{" "}
                  <a
                    href="#"
                    className="border-b border-[color:var(--line-2)] font-medium text-navy-900 hover:border-mint-600 hover:text-mint-600"
                  >
                    Зареєструватися
                  </a>
                </>
              )}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
