import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ContainerProps {
  children: ReactNode;
  className?: string;
}

/** Centered 1280px max-width wrapper, matching the mockup `.container`. */
export function Container({ children, className }: ContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1280px] px-8 max-[720px]:px-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
