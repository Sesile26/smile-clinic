"use client";

import { useEffect, useRef } from "react";

/**
 * Fires `onSignal` whenever a notification of the given `type` arrives on the
 * EXISTING notifications SSE stream (the same channel the header bell uses —
 * /api/notifications/stream, `notification` events). A lightweight extra
 * listener, NOT a separate realtime mechanism: it opens its own EventSource to
 * the same endpoint and ignores every other notification type, so the bell is
 * untouched. Used by /admin/orders ("order_new") and /admin/appointments
 * ("appointment_new").
 *
 * The handler is kept in a ref so the subscription opens ONCE (on mount) and
 * never re-subscribes when the caller's closure changes.
 */
export function useNotificationSignal(type: string, onSignal: () => void): void {
  const handlerRef = useRef(onSignal);
  useEffect(() => {
    handlerRef.current = onSignal;
  });

  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    const onMessage = (e: MessageEvent) => {
      try {
        const n = JSON.parse(e.data) as { type?: string };
        if (n?.type === type) handlerRef.current();
      } catch {
        /* ignore malformed frame */
      }
    };
    es.addEventListener("notification", onMessage as EventListener);
    return () => {
      es.removeEventListener("notification", onMessage as EventListener);
      es.close();
    };
  }, [type]);
}
