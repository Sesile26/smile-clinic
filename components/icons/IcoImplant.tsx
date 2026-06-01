import type { IconProps } from "./IconProps";

export function IcoImplant({
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
      <path d="M12 3v6" />
      <path d="M9 9h6l-1 4h-4l-1-4Z" />
      <path d="M10 13l1 2h2l1-2" />
      <path d="M11 15v4M13 15v4" />
      <circle cx="12" cy="5" r="1.5" />
    </svg>
  );
}
