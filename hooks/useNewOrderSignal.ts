"use client";

import { useEffect, useRef } from "react";

/**
 * Fires `onNewOrder` whenever an `order_new` notification arrives on the
 * EXISTING notifications SSE stream (the same channel the header bell uses —
 * /api/notifications/stream, `notification` events). This is a lightweight
 * extra listener, NOT a separate realtime mechanism: it opens its own
 * EventSource to the same endpoint and ignores every notification type except
 * `order_new`, so the bell is untouched.
 *
 * The handler is kept in a ref so the subscription is opened ONCE (on mount)
 * and never re-subscribes when the caller's closure changes.
 */
export function useNewOrderSignal(onNewOrder: () => void): void {
  const handlerRef = useRef(onNewOrder);
  useEffect(() => {
    handlerRef.current = onNewOrder;
  });

  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    const onMessage = (e: MessageEvent) => {
      try {
        const n = JSON.parse(e.data) as { type?: string };
        if (n?.type === "order_new") handlerRef.current();
      } catch {
        /* ignore malformed frame */
      }
    };
    es.addEventListener("notification", onMessage as EventListener);
    return () => {
      es.removeEventListener("notification", onMessage as EventListener);
      es.close();
    };
  }, []);
}
