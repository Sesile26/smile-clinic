import type { IconProps } from "./IconProps";

export function IcoYoutube({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M22 8.2c-.1-1.4-.4-2.3-1.2-2.8-.7-.4-2.2-.5-8.8-.5s-8.1.1-8.8.5C2.4 5.9 2.1 6.8 2 8.2c0 .8-.1 1.7-.1 3.8s.1 3 .1 3.8c.1 1.4.4 2.3 1.2 2.8.7.4 2.2.5 8.8.5s8.1-.1 8.8-.5c.8-.5 1.1-1.4 1.2-2.8 0-.8.1-1.7.1-3.8s-.1-3-.1-3.8ZM10 15V9l5 3-5 3Z" />
    </svg>
  );
}
