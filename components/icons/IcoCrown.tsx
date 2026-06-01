import type { IconProps } from "./IconProps";

export function IcoCrown({ className, size = 24, strokeWidth = 1.5 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 17h18l-1.5-9-4.5 4-3-6-3 6-4.5-4L3 17Z" />
      <path d="M3 20h18" />
    </svg>
  );
}
