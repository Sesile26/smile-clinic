"use client";

import { cn } from "@/lib/cn";

/** Loading skeleton shaped like the week grid. */
export function SkeletonCalendar() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="overflow-hidden rounded-xl border border-[color:var(--line)] bg-white"
    >
      <span className="sr-only">Завантаження розкладу…</span>
      <div
        className="grid gap-px border-b border-[color:var(--line)] bg-cream/60 p-2"
        style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-7 animate-pulse rounded bg-bone/70" />
        ))}
      </div>
      <div className="space-y-2 p-2">
        {Array.from({ length: 7 }).map((_, r) => (
          <div
            key={r}
            className="grid gap-1"
            style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}
          >
            {Array.from({ length: 8 }).map((_, c) => (
              <div
                key={c}
                className="h-9 animate-pulse rounded-lg bg-bone/60"
                style={{ animationDelay: `${(r + c) * 40}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Empty result placeholder. */
export function EmptyState({
  title = "Немає вільних слотів",
  hint,
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--line-2)] bg-white px-6 py-16 text-center">
      <span
        aria-hidden="true"
        className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-cream text-navy-400"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18M9 16l6 0" />
        </svg>
      </span>
      <p className="text-base font-medium text-navy-900">{title}</p>
      {hint && <p className="mt-1 max-w-[40ch] text-sm text-navy-400">{hint}</p>}
    </div>
  );
}

/** Inline error banner with a retry affordance. */
export function ErrorBanner({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-100 text-red-600"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 9v4M12 17h.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-medium text-red-800">
            Не вдалося завантажити розклад
          </p>
          <p className="text-sm text-red-700/80">
            Сталася помилка з’єднання. Перевірте інтернет і спробуйте ще раз.
          </p>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 self-start rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 sm:self-auto"
        >
          Спробувати знову
        </button>
      )}
    </div>
  );
}

/** Offline notice shown above a read-only calendar. */
export function OfflineNotice({
  className,
  message,
}: {
  className?: string;
  /** Override the default (patient-oriented) copy. */
  message?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2.5 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-800",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 shrink-0 rounded-full bg-yellow-500"
      />
      <span>
        {message ?? (
          <>
            Ви офлайн. Розклад показано лише для перегляду —{" "}
            <strong className="font-medium">
              бронювання доступне лише онлайн
            </strong>
            .
          </>
        )}
      </span>
    </div>
  );
}
