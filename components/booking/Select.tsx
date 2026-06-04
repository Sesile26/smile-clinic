"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { IcoChevron } from "@/components/icons";

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
}

/** Label + native <select> styled to match the brand (mint focus ring). */
export function Select({ label, value, options, onChange, className }: SelectProps) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className="text-xs font-medium tracking-[0.04em] text-navy-700"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full appearance-none rounded-lg border border-[color:var(--line-2)] bg-white py-[11px] pl-3.5 pr-10 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200",
            "focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]",
          )}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <IcoChevron
          size={18}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-navy-400"
        />
      </div>
    </div>
  );
}
