"use client";

import { cn } from "@/lib/cn";
import type { DemoState } from "./data";

interface DemoControlsProps {
  demoState: DemoState;
  onDemoState: (s: DemoState) => void;
  forceOffline: boolean;
  onForceOffline: (v: boolean) => void;
  online: boolean;
}

const STATES: { value: DemoState; label: string }[] = [
  { value: "ready", label: "Готово" },
  { value: "loading", label: "Завантаження" },
  { value: "empty", label: "Порожньо" },
  { value: "error", label: "Помилка" },
];

/**
 * Demo-only control strip to preview every async UI state without a backend.
 * Not part of a real storefront — it's the scaffold for the required states.
 */
export function DemoControls({
  demoState,
  onDemoState,
  forceOffline,
  onForceOffline,
  online,
}: DemoControlsProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-dashed border-[color:var(--line-2)] bg-cream/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[11px] font-medium uppercase tracking-[0.08em] text-navy-400">
          Демо-стани каталогу
        </span>
        <div
          role="group"
          aria-label="Стан каталогу"
          className="flex flex-wrap items-center rounded-full bg-white p-1"
        >
          {STATES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={s.value === demoState}
              onClick={() => onDemoState(s.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                s.value === demoState
                  ? "bg-navy-900 text-white"
                  : "text-navy-400 hover:text-navy-900",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={forceOffline}
        onClick={() => onForceOffline(!forceOffline)}
        className="inline-flex items-center gap-2.5 rounded-full border border-[color:var(--line-2)] bg-white px-3 py-1.5 text-[13px] font-medium text-navy-900 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative h-4 w-7 rounded-full transition-colors",
            forceOffline ? "bg-yellow-500" : "bg-bone",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-[left] duration-200",
              forceOffline ? "left-3.5" : "left-0.5",
            )}
          />
        </span>
        Симулювати офлайн
        {!online && (
          <span className="text-[11px] font-normal text-navy-400">
            (ви офлайн)
          </span>
        )}
      </button>
    </div>
  );
}
