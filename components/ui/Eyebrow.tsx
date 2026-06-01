import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EyebrowProps {
  children: ReactNode;
  className?: string;
}

/** Uppercase label with a mint dot, matching the mockup `.eyebrow`. */
export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-sans text-xs font-medium uppercase tracking-[0.18em] text-navy-400",
        className,
      )}
    >
      <span className="mr-2.5 inline-block h-1.5 w-1.5 rounded-full bg-mint" />
      {children}
    </span>
  );
}
