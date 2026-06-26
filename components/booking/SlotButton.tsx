"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Visual variant of a single slot. Kept separate from {@link SlotStatus} on
 * purpose: the patient view also needs a "selected" look that the data layer
 * doesn't know about.
 */
export type SlotVariant =
  | "off"
  | "working"
  | "booked"
  | "free"
  | "selected"
  | "unavailable";

interface SlotButtonProps {
  time: string;
  variant: SlotVariant;
  /** Disables interaction but keeps the slot visible (offline / read-only). */
  disabled?: boolean;
  /** Slot start is in the past — muted, never actionable. */
  past?: boolean;
  /** Booked slots are disabled by default; set this to keep a booked slot
   *  clickable (e.g. the manage popup that opens appointment details). */
  actionable?: boolean;
  /** Roving-tabindex: only the active cell is in the tab order. */
  tabIndex?: number;
  /** Overrides the computed title/tooltip. */
  title?: string;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocusCapture?: () => void;
  className?: string;
}

const VARIANT_CLASS: Record<SlotVariant, string> = {
  // doctor view — not working: subtle, invites a click
  off: "border-[color:var(--line-2)] bg-white text-navy-400 hover:border-navy-900 hover:text-navy-900",
  // doctor view — working: mint fill, the "я працюю" state
  working:
    "border-mint bg-mint-100 text-navy-900 hover:bg-mint/30 aria-pressed:border-mint",
  // both views — booked: locked navy chip. cursor-not-allowed is applied via
  // the `disabled:` modifier below, so a manage popup can make it clickable.
  booked: "border-navy-900/15 bg-navy-900/[0.06] text-navy-400",
  // patient view — a free slot to grab
  free: "border-mint/60 bg-white text-navy-900 hover:border-mint hover:bg-mint-100",
  // patient view — the slot currently chosen in the confirm flow
  selected: "border-mint bg-mint text-navy-900 shadow-s1",
  // patient view — a time with no free slot (or booked): greyed, inert, does
  // NOT invite a click (unlike the manage "off"). Shown so the patient sees the
  // same full grid the staff/doctor see.
  unavailable: "border-[color:var(--line)] bg-cream/40 text-navy-400/60",
};

/**
 * One time slot. Always a real <button type="button"> so it is keyboard- and
 * screen-reader-friendly; the parent grids wire up arrow-key roving focus.
 */
export const SlotButton = forwardRef<HTMLButtonElement, SlotButtonProps>(
  function SlotButton(
    {
      time,
      variant,
      disabled,
      past,
      actionable,
      tabIndex,
      title,
      onClick,
      onKeyDown,
      onFocusCapture,
      className,
    },
    ref,
  ) {
    const isBooked = variant === "booked";
    const isPast = !!past;
    // Past slots are never a live toggle, regardless of underlying status.
    const isToggle = !isPast && (variant === "off" || variant === "working");

    const label = isPast
      ? `${time} — час уже минув`
      : isBooked
        ? `${time} — зайнято, є запис`
        : variant === "working"
          ? `${time} — працюю`
          : variant === "unavailable"
            ? `${time} — недоступно`
            : `${time} — вільно`;

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || isPast || variant === "unavailable" || (isBooked && !actionable)}
        tabIndex={tabIndex}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onFocusCapture={onFocusCapture}
        aria-label={label}
        aria-pressed={isToggle ? variant === "working" : undefined}
        title={
          title ??
          (isPast
            ? "Час уже минув"
            : isBooked
              ? "Зайнято — є запис"
              : undefined)
        }
        className={cn(
          "flex min-h-[34px] w-full items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[13px] font-medium tabular-nums transition-colors duration-150",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed",
          // Past styling overrides the status variant: muted grey, no hover.
          isPast
            ? "border-[color:var(--line)] bg-cream/40 text-navy-400/50 line-through"
            : VARIANT_CLASS[variant],
          !isPast && disabled && !isBooked && "opacity-50",
          className,
        )}
      >
        <span>{time}</span>
        {!isPast && isBooked && (
          <span aria-hidden="true" className="text-[10px] uppercase tracking-wide">
            ·зайнято
          </span>
        )}
        {!isPast && variant === "working" && (
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </button>
    );
  },
);
