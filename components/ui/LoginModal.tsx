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
import { registerSchema, type RegisterValues } from "@/schemas/register";
import {
  IcoArrow,
  IcoClose,
  IcoClock,
  IcoGoogle,
  IcoLock,
  IcoMail,
  IcoShield,
  IcoTooth,
} from "@/components/icons";

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  /** Same-origin path to land on after a successful sign-in (default "/").
   *  The /login page passes the sanitized ?callbackUrl here so a guest who was
   *  redirected off a protected route continues where they wanted to go. */
  callbackUrl?: string;
}

type Tab = "signin" | "signup";
type SubmitStatus = "idle" | "submitting";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const fieldInput =
  "w-full rounded-lg border border-[color:var(--line-2)] bg-white py-[13px] pl-10 pr-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]";

const fieldLabel = "text-xs font-medium tracking-[0.04em] text-navy-700";
const fieldError = "text-xs text-red-500";

export function LoginModal({
  open,
  onClose,
  callbackUrl = "/",
}: LoginModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const signinTabRef = useRef<HTMLButtonElement>(null);
  const signupTabRef = useRef<HTMLButtonElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<Tab>("signin");
  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [pill, setPill] = useState<{ left: number; width: number }>({
    left: 4,
    width: 0,
  });

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", phone: "+380", password: "" },
  });

  const isSignup = tab === "signup";

  const measurePill = useCallback(() => {
    const active = isSignup ? signupTabRef.current : signinTabRef.current;
    const parent = tabsRef.current;
    if (!active || !parent) return;
    const a = active.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    setPill({ left: a.left - p.left, width: a.width });
  }, [isSignup]);

  // Reposition the tab pill when the active tab changes, modal opens, or
  // the window resizes.
  useLayoutEffect(() => {
    if (open) measurePill();
  }, [open, tab, measurePill]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => measurePill();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, measurePill]);

  // Open/close side effects: scroll lock, autofocus first input, reset state.
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    setStatus("idle");
    setShowPw(false);
    setFormError(null);

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

  // Reset error and submit status when tab changes.
  useEffect(() => {
    setFormError(null);
    setStatus("idle");
  }, [tab]);

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

  // ─── Submit handlers ───────────────────────────────────────────────────────

  const onSignin = async (values: LoginValues) => {
    setFormError(null);
    setStatus("submitting");
    try {
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
      });

      if (!result?.ok || result.error) {
        // Generic message — never reveal whether the email or the password
        // was wrong. Anti-enumeration default.
        setFormError("Невірний email або пароль");
        setStatus("idle");
        return;
      }

      // Hard navigation: forces useSession on the destination page to pick
      // up the freshly-set cookie without an extra round-trip.
      window.location.href = callbackUrl;
    } catch (err) {
      console.error("[signin] unexpected error", err);
      setFormError("Щось пішло не так. Спробуйте ще раз.");
      setStatus("idle");
    }
  };

  const onSignup = async (values: RegisterValues) => {
    setFormError(null);
    setStatus("submitting");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        let message = "Не вдалося створити акаунт";
        let field: string | undefined;
        try {
          const data = (await res.json()) as {
            error?: string;
            field?: string;
          };
          if (data.error) message = data.error;
          field = data.field;
        } catch {
          /* keep default */
        }
        // A phone conflict (409) is shown inline under the phone field,
        // separate from the email/global error banner.
        if (res.status === 409 && field === "phone") {
          registerForm.setError("phone", { type: "server", message });
          registerForm.setFocus("phone");
        } else {
          setFormError(message);
        }
        setStatus("idle");
        return;
      }

      // Registration OK — auto sign-in with the same credentials, then
      // redirect via signIn's built-in window.location handling.
      await signIn("credentials", {
        email: values.email,
        password: values.password,
        callbackUrl,
        redirect: true,
      });
    } catch (err) {
      console.error("[signup] unexpected error", err);
      setFormError("Щось пішло не так. Спробуйте ще раз.");
      setStatus("idle");
    }
  };

  const handleGoogle = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    await signIn("google", { callbackUrl, redirect: true });
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const submitLabel =
    status === "submitting"
      ? "Перевіряємо…"
      : isSignup
        ? "Зареєструватися"
        : "Увійти";

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

          {/* Tabs: Вхід / Реєстрація */}
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
              ref={signinTabRef}
              type="button"
              role="tab"
              aria-selected={!isSignup}
              onClick={() => setTab("signin")}
              className={cn(
                "relative z-[2] rounded-full px-[22px] py-2.5 text-[13px] font-medium transition-colors duration-200",
                isSignup ? "text-navy-400" : "text-navy-900",
              )}
            >
              Вхід
            </button>
            <button
              ref={signupTabRef}
              type="button"
              role="tab"
              aria-selected={isSignup}
              onClick={() => setTab("signup")}
              className={cn(
                "relative z-[2] rounded-full px-[22px] py-2.5 text-[13px] font-medium transition-colors duration-200",
                isSignup ? "text-navy-900" : "text-navy-400",
              )}
            >
              Реєстрація
            </button>
          </div>

          <h3 className="m-0 mb-2 font-serif text-[28px] leading-[1.15] tracking-[-0.015em] text-navy-900">
            {isSignup ? (
              <>
                Створіть <em className="italic text-mint-600">акаунт</em>.
              </>
            ) : (
              <>
                Вітаємо, <em className="italic text-mint-600">пацієнте</em>.
              </>
            )}
          </h3>
          <p className="m-0 mb-7 text-sm text-navy-400">
            {isSignup
              ? "Зареєструйтесь, щоб бронювати візити та бачити свою історію."
              : "Увійдіть, щоб переглянути історію візитів та керувати записами."}
          </p>

          {formError && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {formError}
            </div>
          )}

          {/* ─── Sign-in form ──────────────────────────────────────────────── */}
          {!isSignup && (
            <form onSubmit={loginForm.handleSubmit(onSignin)} noValidate>
              <div className="relative mb-4 flex flex-col gap-1.5">
                <label htmlFor="email" className={fieldLabel}>
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
                    {...loginForm.register("email")}
                  />
                </div>
                {loginForm.formState.errors.email && (
                  <span className={fieldError}>
                    {loginForm.formState.errors.email.message}
                  </span>
                )}
              </div>

              <div className="relative mb-4 flex flex-col gap-1.5">
                <label htmlFor="pw" className={fieldLabel}>
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
                    {...loginForm.register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 rounded-md p-1.5 text-xs text-navy-400 transition-colors hover:text-navy-900"
                  >
                    {showPw ? "Сховати" : "Показати"}
                  </button>
                </div>
                {loginForm.formState.errors.password && (
                  <span className={fieldError}>
                    {loginForm.formState.errors.password.message}
                  </span>
                )}
              </div>

              <SubmitButton submitting={status === "submitting"}>
                {submitLabel}
              </SubmitButton>
            </form>
          )}

          {/* ─── Sign-up form ──────────────────────────────────────────────── */}
          {isSignup && (
            <form onSubmit={registerForm.handleSubmit(onSignup)} noValidate>
              <div className="relative mb-4 flex flex-col gap-1.5">
                <label htmlFor="name" className={fieldLabel}>
                  Імʼя та прізвище
                </label>
                <input
                  id="name"
                  type="text"
                  placeholder="Іван Петренко"
                  autoComplete="name"
                  className={cn(fieldInput, "pl-3.5")}
                  {...registerForm.register("name")}
                />
                {registerForm.formState.errors.name && (
                  <span className={fieldError}>
                    {registerForm.formState.errors.name.message}
                  </span>
                )}
              </div>

              <div className="relative mb-4 flex flex-col gap-1.5">
                <label htmlFor="email" className={fieldLabel}>
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
                    {...registerForm.register("email")}
                  />
                </div>
                {registerForm.formState.errors.email && (
                  <span className={fieldError}>
                    {registerForm.formState.errors.email.message}
                  </span>
                )}
              </div>

              <div className="relative mb-4 flex flex-col gap-1.5">
                <label htmlFor="phone" className={fieldLabel}>
                  Телефон
                </label>
                <input
                  id="phone"
                  type="tel"
                  placeholder="+380XXXXXXXXX"
                  autoComplete="tel"
                  className={cn(fieldInput, "pl-3.5")}
                  {...registerForm.register("phone")}
                />
                {registerForm.formState.errors.phone && (
                  <span className={fieldError}>
                    {registerForm.formState.errors.phone.message}
                  </span>
                )}
              </div>

              <div className="relative mb-4 flex flex-col gap-1.5">
                <label htmlFor="pw" className={fieldLabel}>
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
                    placeholder="Мінімум 8 символів, з цифрою"
                    autoComplete="new-password"
                    className={cn(fieldInput, "pr-20")}
                    {...registerForm.register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 rounded-md p-1.5 text-xs text-navy-400 transition-colors hover:text-navy-900"
                  >
                    {showPw ? "Сховати" : "Показати"}
                  </button>
                </div>
                {registerForm.formState.errors.password && (
                  <span className={fieldError}>
                    {registerForm.formState.errors.password.message}
                  </span>
                )}
              </div>

              <SubmitButton submitting={status === "submitting"}>
                {submitLabel}
              </SubmitButton>
            </form>
          )}

          {/* Google OAuth — shown in both tabs */}
          <div className="my-[22px] flex items-center gap-3 text-xs uppercase tracking-[0.08em] text-navy-400 before:h-px before:flex-1 before:bg-[color:var(--line)] after:h-px after:flex-1 after:bg-[color:var(--line)]">
            або
          </div>
          <button
            type="button"
            onClick={handleGoogle}
            className="inline-flex w-full items-center justify-center gap-2.5 rounded-lg border border-[color:var(--line-2)] bg-white px-3.5 py-3 text-sm font-medium text-navy-900 transition-colors hover:bg-cream"
          >
            <IcoGoogle size={18} />
            Продовжити з Google
          </button>

          <p className="mt-[22px] text-center text-[13px] text-navy-400">
            {isSignup ? (
              <>
                Вже маєте акаунт?{" "}
                <button
                  type="button"
                  onClick={() => setTab("signin")}
                  className="border-b border-[color:var(--line-2)] font-medium text-navy-900 hover:border-mint-600 hover:text-mint-600"
                >
                  Увійти
                </button>
              </>
            ) : (
              <>
                Ще не маєте акаунту?{" "}
                <button
                  type="button"
                  onClick={() => setTab("signup")}
                  className="border-b border-[color:var(--line-2)] font-medium text-navy-900 hover:border-mint-600 hover:text-mint-600"
                >
                  Зареєструватися
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function SubmitButton({
  submitting,
  children,
}: {
  submitting: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={submitting}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2.5 rounded-lg py-3.5 text-[15px] font-medium text-white transition-[background,transform] duration-200 hover:-translate-y-px",
        "bg-navy-900 hover:bg-black",
        submitting && "opacity-80",
      )}
    >
      {children}
      {!submitting && <IcoArrow size={16} />}
    </button>
  );
}
