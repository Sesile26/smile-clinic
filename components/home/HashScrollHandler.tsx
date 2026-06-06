"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * App Router hash-scroll fix.
 *
 * When you navigate to "/#prices" from ANOTHER route, the browser/Next tries to
 * scroll to the anchor before the home-page sections have mounted, so the jump
 * silently fails. This component runs after the home page mounts, reads
 * `location.hash`, and scrolls to the target itself.
 *
 * Same-page hash clicks (already on "/") are handled natively: Next scrolls to
 * the element and `html { scroll-behavior: smooth }` (globals.css) + the
 * `scroll-mt-*` on each section make it a smooth, header-offset scroll. The
 * effect keys on `pathname`, so it does not interfere with those.
 */
export function HashScrollHandler() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || hash === "#") return;

    const id = decodeURIComponent(hash.slice(1));

    const scrollToTarget = () => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    // Wait for layout: one frame for mount, plus a fallback timeout in case
    // section content (fonts/Reveal) settles a tick later.
    const raf = requestAnimationFrame(scrollToTarget);
    const timer = window.setTimeout(scrollToTarget, 200);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
