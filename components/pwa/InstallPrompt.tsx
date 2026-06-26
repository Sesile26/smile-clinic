"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scroll-lock";
import { btnBase, btnMint, btnGhost } from "@/lib/buttons";
import { IcoClose } from "@/components/icons";
import { installMode } from "@/lib/install-mode";

/** Chromium's install event (not in lib.dom types). */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa-install-dismissed";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Unobtrusive "Install app" banner. Android/desktop Chromium → fires the native
 * install prompt; iOS Safari → opens manual "Add to Home Screen" steps; already
 * installed (standalone) or dismissed-this-session → renders nothing.
 */
export function InstallPrompt() {
  // "install" = beforeinstallprompt arrived (Chromium); "ios" = Safari steps.
  const [mode, setMode] = useState<"install" | "ios" | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // ponytail: sessionStorage = session-scoped persist (survives reloads in the
    // tab, gone next session), not localStorage. Switch to Dexie only if a
    // longer "later" is ever wanted.
    if (sessionStorage.getItem(DISMISS_KEY)) {
      queueMicrotask(() => setDismissed(true));
      return;
    }
    if (installMode(navigator.userAgent, isStandalone()) === "ios") {
      queueMicrotask(() => setMode("ios"));
    }
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep the browser's own mini-infobar from showing
      deferred.current = e as BeforeInstallPromptEvent;
      setMode("install");
    };
    const onInstalled = () => setMode(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, "1");
  }, []);

  const install = useCallback(async () => {
    const e = deferred.current;
    if (!e) return;
    await e.prompt();
    await e.userChoice;
    deferred.current = null;
    setMode(null); // either installed or declined — don't nag again this session
  }, []);

  if (dismissed || mode === null) return null;

  return (
    <>
      <div
        role="region"
        aria-label="Встановлення застосунку"
        className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-navy-900 px-4 py-3 text-white shadow-s2 sm:left-auto sm:right-6 sm:mx-0"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mint/20 text-mint">
          <IcoDownload size={18} />
        </span>
        <p className="min-w-0 flex-1 text-sm leading-snug">
          Встановіть застосунок SmileClinic для швидкого доступу.
        </p>
        <button
          type="button"
          onClick={mode === "install" ? install : () => setIosOpen(true)}
          className={cn(btnBase, btnMint, "shrink-0 px-3.5 py-2 text-sm")}
        >
          Встановити
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Закрити, нагадати пізніше"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
        >
          <IcoClose size={16} />
        </button>
      </div>

      {iosOpen && <IosInstructions onClose={() => setIosOpen(false)} />}
    </>
  );
}

/** iOS Safari can't be triggered programmatically — show the manual steps. */
function IosInstructions({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  useEffect(() => {
    lockBodyScroll();
    const t = window.setTimeout(() => closeRef.current?.focus(), 60);
    return () => {
      window.clearTimeout(t);
      unlockBodyScroll();
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      className="fixed inset-0 z-[120] grid place-items-end bg-[rgba(10,22,40,0.55)] p-4 backdrop-blur-[8px] sm:place-items-center"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="iosInstallTitle"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-s3"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2
            id="iosInstallTitle"
            className="font-serif text-xl text-navy-900"
          >
            Встановити SmileClinic
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="grid h-9 w-9 place-items-center rounded-full text-navy-400 transition-colors hover:bg-cream hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
          >
            <IcoClose size={18} />
          </button>
        </div>
        <ol className="flex flex-col gap-3 text-sm text-navy-700">
          <li className="flex items-center gap-3">
            <Step n={1} />
            <span className="flex flex-wrap items-center gap-1">
              Натисніть
              <IcoShare size={18} className="text-mint-600" />
              <span className="font-medium text-navy-900">Поділитися</span> унизу
              екрана
            </span>
          </li>
          <li className="flex items-center gap-3">
            <Step n={2} />
            <span>
              Виберіть{" "}
              <span className="font-medium text-navy-900">
                «На екран „Початок“»
              </span>
            </span>
          </li>
          <li className="flex items-center gap-3">
            <Step n={3} />
            <span>
              Натисніть <span className="font-medium text-navy-900">«Додати»</span>
            </span>
          </li>
        </ol>
        <button
          type="button"
          onClick={onClose}
          className={cn(btnBase, btnGhost, "mt-5 w-full justify-center")}
        >
          Зрозуміло
        </button>
      </div>
    </div>,
    document.body,
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-mint/20 text-xs font-semibold text-mint-700">
      {n}
    </span>
  );
}

function IcoDownload({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

function IcoShare({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}
