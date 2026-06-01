import type { IconProps } from "./IconProps";

export function IcoTelegram({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M21.4 4.3 2.7 11.5c-1.1.4-1.1 1.1-.2 1.4l4.7 1.5 1.8 5.7c.2.6.3.8.7.8.4 0 .6-.2.8-.4l2.4-2.3 4.9 3.6c.9.5 1.6.2 1.8-.8l3.3-15.5c.3-1.3-.4-1.9-1.5-1.2Zm-3.6 4.6L9 16.1l-.4 3.8-1.6-5.4 11.6-7.3c.5-.3 1 0 .6.7Z" />
    </svg>
  );
}
