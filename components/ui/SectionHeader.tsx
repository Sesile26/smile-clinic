import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { displayL } from "@/lib/typography";
import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

interface SectionHeaderProps {
  eyebrow: string;
  title: ReactNode;
  lede: ReactNode;
  className?: string;
}

/** Two-column section header (title left, lede right) from the mockup `.section-head`. */
export function SectionHeader({
  eyebrow,
  title,
  lede,
  className,
}: SectionHeaderProps) {
  return (
    <Reveal
      className={cn(
        "mb-12 grid grid-cols-1 items-start gap-6 lg:mb-[72px] lg:grid-cols-2 lg:items-end lg:gap-16",
        className,
      )}
    >
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className={cn(displayL, "mt-3.5 text-navy-900")}>{title}</h2>
      </div>
      <p className="text-[18px] leading-[1.55] text-navy-400">{lede}</p>
    </Reveal>
  );
}
