"use client";

import { cn } from "@/lib/cn";

/** Loading skeleton shaped like the patients list. */
export function SkeletonList({ rows = 8 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="overflow-hidden rounded-xl border border-[color:var(--line)] bg-white"
    >
      <span className="sr-only">Завантаження пацієнтів…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-[color:var(--line)] px-4 py-4 last:border-b-0"
        >
          <div className="h-4 w-40 animate-pulse rounded bg-bone/70" />
          <div className="hidden h-4 w-32 animate-pulse rounded bg-bone/50 sm:block" />
          <div className="hidden h-4 flex-1 animate-pulse rounded bg-bone/50 md:block" />
          <div className="ml-auto h-4 w-20 animate-pulse rounded bg-bone/60" />
        </div>
      ))}
    </div>
  );
}

/** Generic centered placeholder used for both "empty" and "not found". */
export function EmptyState({
  title,
  hint,
  icon = "users",
}: {
  title: string;
  hint?: string;
  icon?: "users" | "search";
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--line-2)] bg-white px-6 py-16 text-center">
      <span
        aria-hidden="true"
        className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-cream text-navy-400"
      >
        {icon === "search" ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
          </svg>
        )}
      </span>
      <p className="text-base font-medium text-navy-900">{title}</p>
      {hint && <p className="mt-1 max-w-[42ch] text-sm text-navy-400">{hint}</p>}
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4M12 17h.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-medium text-red-800">
            Не вдалося завантажити пацієнтів
          </p>
          <p className="text-sm text-red-700/80">
            Сталася помилка. Спробуйте ще раз.
          </p>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "shrink-0 self-start rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 sm:self-auto",
          )}
        >
          Спробувати знову
        </button>
      )}
    </div>
  );
}
