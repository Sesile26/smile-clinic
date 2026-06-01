import type { IconProps } from "./IconProps";

export function IcoChild({ className, size = 24, strokeWidth = 1.5 }: IconProps) {
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
      <circle cx="12" cy="7" r="3.5" />
      <path d="M5 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" />
      <path d="M10 7.5h.01M14 7.5h.01" />
      <path d="M10.5 9.5c.5.5 2.5.5 3 0" />
    </svg>
  );
}
