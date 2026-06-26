"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { btnBase, btnMint } from "@/lib/buttons";
import { IcoClose } from "@/components/icons";

/**
 * Shows an unobtrusive "new version available — reload" banner when a fresh
 * deploy's service worker has installed. next-pwa registers the SW with
 * skipWaiting + clientsClaim, so the new SW activates on its own — but the
 * already-loaded page keeps serving the OLD HTML/JS until a reload. An
 * always-open installed PWA never reloads, so without this prompt it shows the
 * stale version indefinitely. The button just reloads → the now-active new SW
 * serves the fresh assets.
 *
 * No SW in dev (next-pwa is disabled there) → getRegistration() is empty and
 * this renders nothing.
 */
export function PwaUpdatePrompt() {
  const [updateReady, setUpdateReady] = useState(false);
  // Closed with the × → hide for now. In-memory only (no persistence), so it
  // reappears on the next full page reload, never persisted across reloads.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    // Whether a SW already controls this page at load. First-ever install
    // (no prior controller) is NOT an update — don't prompt for it.
    const hadController = !!navigator.serviceWorker.controller;
    let reg: ServiceWorkerRegistration | undefined;

    const flagUpdate = () => {
      if (hadController) setUpdateReady(true);
    };

    // A newly installed SW reaching "installed" while a controller exists = update.
    const watch = (sw: ServiceWorker | null) => {
      sw?.addEventListener("statechange", () => {
        if (sw.state === "installed") flagUpdate();
      });
    };

    navigator.serviceWorker.getRegistration().then((r) => {
      reg = r;
      if (!reg) return;
      if (reg.waiting) flagUpdate(); // update found before we mounted
      watch(reg.installing);
      reg.addEventListener("updatefound", () => watch(reg!.installing));
      reg.update().catch(() => {}); // check for a new deploy now
    });

    // The new SW took control (clientsClaim) — definitely a fresh version.
    const onControllerChange = () => flagUpdate();
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Re-check for a new deploy whenever the app returns to the foreground.
    const onVisible = () => {
      if (document.visibilityState === "visible") reg?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!updateReady || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-navy-900 px-4 py-3 text-white shadow-s2 sm:left-auto sm:right-6 sm:mx-0"
    >
      <p className="min-w-0 flex-1 text-sm leading-snug">
        Доступна нова версія застосунку.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className={cn(btnBase, btnMint, "shrink-0 px-3.5 py-2 text-sm")}
      >
        Оновити
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Закрити"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
      >
        <IcoClose size={16} />
      </button>
    </div>
  );
}
