"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

interface RevealProps {
  children: ReactNode;
  /** Element to render. Defaults to a div. */
  as?: ElementType;
  /** Use the staggered child-delay variant (for grids). */
  stagger?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Adds the global `.reveal` / `.reveal-stagger` classes and toggles `in`
 * when the element scrolls into view — the React equivalent of the mockup's
 * IntersectionObserver. SSR-safe: renders hidden, animates on mount.
 */
export function Reveal({
  children,
  as,
  stagger = false,
  className,
  style,
}: RevealProps) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("in");
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn(stagger ? "reveal-stagger" : "reveal", className)}
      style={style}
    >
      {children}
    </Tag>
  );
}
