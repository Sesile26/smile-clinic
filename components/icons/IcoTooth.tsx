import type { IconProps } from "./IconProps";

export function IcoTooth({ className, size = 24, strokeWidth = 1.5 }: IconProps) {
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
      <path d="M12 2c3.5 0 6.5 1.6 6.5 5.2 0 2.4-.6 3.6-1.1 5.4-.5 1.8-.9 3.6-1.4 6-.4 2-1 3.4-2 3.4-1.2 0-1.5-1.6-2-3.6-.3-1.6-.6-2.6-2-2.6s-1.7 1-2 2.6c-.5 2-.8 3.6-2 3.6-1 0-1.6-1.4-2-3.4-.5-2.4-.9-4.2-1.4-6C2.1 10.8 1.5 9.6 1.5 7.2 1.5 3.6 4.5 2 8 2c1.4 0 2.5.3 4 .8 1.5-.5 2.6-.8 4-.8h-4Z" />
    </svg>
  );
}
