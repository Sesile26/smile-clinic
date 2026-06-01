import type { IconProps } from "./IconProps";

export function IcoBraces({
  className,
  size = 24,
  strokeWidth = 1.5,
}: IconProps) {
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
      <rect x="4" y="8" width="3" height="4" rx="0.5" />
      <rect x="10.5" y="8" width="3" height="4" rx="0.5" />
      <rect x="17" y="8" width="3" height="4" rx="0.5" />
      <path d="M3 10h18" />
      <rect x="4" y="14" width="3" height="4" rx="0.5" />
      <rect x="10.5" y="14" width="3" height="4" rx="0.5" />
      <rect x="17" y="14" width="3" height="4" rx="0.5" />
      <path d="M3 16h18" />
    </svg>
  );
}
