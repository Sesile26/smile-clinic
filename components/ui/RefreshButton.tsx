"use client";

import { cn } from "@/lib/cn";

/**
 * Manual "refresh current view" button, shared across the admin tables, the
 * booking manager view and the patient pages. Icon-only on mobile, icon+text on
 * sm+. While `busy` the arrow spins and the button is disabled (no double
 * requests); `aria-busy` announces the loading state.
 *
 * It does NOT decide WHAT to refetch — the page passes an `onClick` that reuses
 * its existing refetch (the same one auto-refresh uses) and keeps the current
 * filters / page / open profile.
 */
export function RefreshButton({
  onClick,
  busy = false,
  className,
}: {
  onClick: () => void;
  busy?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="Оновити"
      aria-busy={busy}
      title="Оновити"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--line-2)] bg-white px-3 py-2 text-sm font-medium text-navy-700 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={cn(busy && "animate-spin")}
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      <span className="hidden sm:inline">{busy ? "Оновлення…" : "Оновити"}</span>
    </button>
  );
}
