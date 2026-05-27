"use client";

import { useEffect, useState } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineBanner() {
  const { isOnline } = useOnlineStatus();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isOnline) setDismissed(false);
  }, [isOnline]);

  if (isOnline || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-4 border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-200"
    >
      <p className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 shrink-0 rounded-full bg-yellow-400"
        />
        <span className="truncate">
          You&apos;re offline. Changes will sync when you reconnect.
        </span>
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss offline notice"
        className="rounded p-1 leading-none text-yellow-200/70 hover:bg-yellow-500/20 hover:text-yellow-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
      >
        ×
      </button>
    </div>
  );
}
