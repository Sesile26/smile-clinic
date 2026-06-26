"use client";

import { useEffect, useRef } from "react";

/**
 * Fires `onSignal` whenever a notification of one of the given `type`(s) arrives
 * on the EXISTING notifications SSE stream (the same channel the header bell
 * uses — /api/notifications/stream, `notification` events). A lightweight extra
 * listener, NOT a separate realtime mechanism: it opens ONE EventSource to the
 * same endpoint and ignores every other type, so the bell is untouched. Pass an
 * array to react to several types over a single connection (avoids opening one
 * EventSource per type). Callers: /admin/orders ("order_new"),
 * /admin/appointments + /booking (["appointment_new","appointment_status"]),
 * /my/appointments ("appointment_status"), /my/orders ("order_status").
 *
 * The handler is kept in a ref so the subscription opens ONCE (on mount) and
 * never re-subscribes when the caller's closure changes.
 */
export function useNotificationSignal(
  type: string | string[],
  onSignal: () => void,
): void {
  const handlerRef = useRef(onSignal);
  useEffect(() => {
    handlerRef.current = onSignal;
  });

  // Stable string key so the subscription effect doesn't re-run on a new array
  // identity each render; the types are reconstructed from it inside.
  const key = Array.isArray(type) ? type.join(",") : type;

  useEffect(() => {
    const wanted = new Set(key.split(","));
    const es = new EventSource("/api/notifications/stream");
    const onMessage = (e: MessageEvent) => {
      try {
        const n = JSON.parse(e.data) as { type?: string };
        if (n?.type && wanted.has(n.type)) handlerRef.current();
      } catch {
        /* ignore malformed frame */
      }
    };
    es.addEventListener("notification", onMessage as EventListener);
    return () => {
      es.removeEventListener("notification", onMessage as EventListener);
      es.close();
    };
  }, [key]);
}
