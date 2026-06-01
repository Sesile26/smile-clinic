import type { IconProps } from "./IconProps";

/** Multicolor Google "G" mark — brand colors are fixed, so `currentColor` does not apply. */
export function IcoGoogle({ className, size = 18 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      className={className}
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M17.6 9.2c0-.6-.1-1.2-.2-1.7H9v3.3h4.8c-.2 1.1-.8 2.1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.4 0 4.5-.8 5.9-2.2l-2.9-2.2c-.8.5-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H1V13c1.5 2.9 4.5 5 8 5Z"
      />
      <path
        fill="#FBBC05"
        d="M4 10.8c-.2-.5-.3-1.1-.3-1.8 0-.6.1-1.2.3-1.8V5h-3C.3 6.2 0 7.6 0 9s.3 2.8.9 4l3.1-2.2Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.5-2.5C13.5.9 11.4 0 9 0 5.5 0 2.5 2.1 1 5l3 2.3C4.7 5.2 6.7 3.6 9 3.6Z"
      />
    </svg>
  );
}
