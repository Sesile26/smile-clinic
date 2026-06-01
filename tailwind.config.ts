import type { Config } from "tailwindcss";

/**
 * Tailwind v4 still reads this file when referenced via `@config` in
 * app/globals.css. Tokens here mirror the SmileClinic mockup CSS variables 1:1.
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          900: "#0A1628",
          800: "#0F1E36",
          700: "#1A2B45",
          400: "#4A5A75",
        },
        ink: "#0A1628",
        paper: "#FFFFFF",
        cream: "#F7F4EE",
        bone: "#EEE8DC",
        mint: {
          DEFAULT: "#00C9A7",
          600: "#00B393",
          100: "#DDF7F0",
        },
      },
      fontFamily: {
        serif: [
          "var(--font-cormorant)",
          "Cormorant Garamond",
          "Times New Roman",
          "serif",
        ],
        sans: ["var(--font-dm-sans)", "DM Sans", "system-ui", "sans-serif"],
      },
      boxShadow: {
        s1: "0 1px 2px rgba(10,22,40,.04), 0 8px 24px -12px rgba(10,22,40,.08)",
        s2: "0 2px 6px rgba(10,22,40,.04), 0 24px 48px -20px rgba(10,22,40,.18)",
        s3: "0 30px 80px -30px rgba(10,22,40,.35)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(.22,.61,.36,1)",
      },
      keyframes: {
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        marq: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        floaty: "floaty 6s ease-in-out infinite",
        marq: "marq 40s linear infinite",
      },
    },
  },
} satisfies Config;
