"use client";

import { useEffect, useState } from "react";

/**
 * Anti-flicker gate: returns `true` only once `active` has stayed true for
 * `delay` ms; flips back to `false` immediately when `active` goes false. Use
 * it to avoid flashing a loading skeleton on requests that resolve quickly.
 */
export function useDelayedFlag(active: boolean, delay = 200): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      // Hide right away (deferred to a microtask so we never call setState
      // synchronously in the effect body).
      queueMicrotask(() => setVisible(false));
      return;
    }
    const t = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(t);
  }, [active, delay]);

  return visible;
}
