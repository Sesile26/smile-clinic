"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useLoginModal } from "./LoginModalProvider";
import { IcoClose, IcoSparkle } from "@/components/icons";

/**
 * Floating hint that lets a visitor discover the one-click demo logins. Opens
 * the login modal (its "Демо-доступ" section). Shown ONLY to signed-out
 * visitors — hidden while the session resolves and for anyone already logged
 * in. Dismissible for the current page session (in-memory, no storage).
 */
export function DemoAccessBanner() {
  const { status } = useSession();
  const { open } = useLoginModal();
  const [dismissed, setDismissed] = useState(false);

  if (status !== "unauthenticated" || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-0.5 rounded-full border border-white/10 bg-navy-900 p-1 text-white shadow-s2">
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
      >
        <span
          aria-hidden="true"
          className="grid h-5 w-5 place-items-center rounded-full bg-mint text-navy-900"
        >
          <IcoSparkle size={12} />
        </span>
        Спробувати демо
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Сховати підказку про демо-доступ"
        className="grid h-7 w-7 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
      >
        <IcoClose size={14} />
      </button>
    </div>
  );
}
