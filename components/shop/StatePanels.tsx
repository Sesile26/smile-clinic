"use client";

import { cn } from "@/lib/cn";

function SkeletonCard({ i }: { i: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white">
      <div
        className="aspect-[4/3] animate-pulse bg-bone/60"
        style={{ animationDelay: `${i * 60}ms` }}
      />
      <div className="space-y-3 p-5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-bone/70" />
        <div className="h-3 w-full animate-pulse rounded bg-bone/50" />
        <div className="h-9 w-full animate-pulse rounded-full bg-bone/60" />
      </div>
    </div>
  );
}

/** Loading skeleton shaped like the product grid (first load). */
export function SkeletonGrid() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      <span className="sr-only">Завантаження товарів…</span>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} i={i} />
      ))}
    </div>
  );
}

/** Skeleton cards to append while the next page loads (infinite scroll). */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} i={i} />
      ))}
    </>
  );
}

/** Empty catalog / no results placeholder. */
export function EmptyState({
  title = "Немає товарів",
  hint,
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[color:var(--line-2)] bg-white px-6 py-16 text-center">
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
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
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
      className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
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
            Не вдалося завантажити товари
          </p>
          <p className="text-sm text-red-700/80">
            Сталася помилка. Перевірте з’єднання і спробуйте ще раз.
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

/** Offline notice — the catalog/cart stay viewable but writes are online-only.
 *  `message` overrides the default (e.g. category management vs. checkout). */
export function OfflineNotice({
  className,
  message,
}: {
  className?: string;
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
            Ви офлайн. Каталог доступний лише для перегляду —{" "}
            <strong className="font-medium">
              оформлення доступне лише онлайн
            </strong>
            .
          </>
        )}
      </span>
    </div>
  );
}
