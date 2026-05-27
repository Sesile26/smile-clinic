"use client";

import { useSync } from "@/hooks/useSync";

export function SyncStatus() {
  const { isSyncing, pendingCount, triggerSync } = useSync();

  if (!isSyncing && pendingCount === 0) {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-full bg-[#00C9A7]/10 px-3 py-1.5 text-xs font-medium text-[#00C9A7] ring-1 ring-inset ring-[#00C9A7]/30"
        role="status"
        aria-live="polite"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#00C9A7]" />
        All synced
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void triggerSync()}
      disabled={isSyncing}
      className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-inset ring-white/10 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00C9A7]"
      aria-live="polite"
    >
      {isSyncing ? (
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00C9A7] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00C9A7]" />
        </span>
      ) : (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-400"
          aria-hidden="true"
        />
      )}
      {isSyncing
        ? "Syncing…"
        : `${pendingCount} pending — sync now`}
    </button>
  );
}
