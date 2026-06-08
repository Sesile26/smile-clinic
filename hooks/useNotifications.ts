"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchNotifications,
  markAllRead as apiMarkAllRead,
  markRead as apiMarkRead,
  type ClientNotification,
} from "@/lib/notifications-client";

export type ListState = "loading" | "ready" | "error";
/** SSE link state — drives the calm "перепідключення…" hint. */
export type ConnState = "connecting" | "open" | "reconnecting";

export interface UseNotifications {
  items: ClientNotification[];
  unread: number;
  listState: ListState;
  conn: ConnState;
  markOneRead: (id: string) => void;
  markAllAsRead: () => void;
  reload: () => void;
}

/**
 * Notifications state for the header bell.
 *
 * - Initial load + every (re)connect: GET /api/notifications (resync).
 * - Realtime: EventSource('/api/notifications/stream'); each `notification`
 *   event is prepended (deduped by id).
 * - `unread` is DERIVED from items (filter isRead=false) so the badge, SSE
 *   pushes, and read-marking can never drift out of sync.
 * - EventSource auto-reconnects; we surface "reconnecting" on error and resync
 *   on the next open so events missed while offline aren't lost.
 */
export function useNotifications(enabled: boolean): UseNotifications {
  const [items, setItems] = useState<ClientNotification[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [conn, setConn] = useState<ConnState>("connecting");

  const unread = useMemo(
    () => items.filter((i) => !i.isRead).length,
    [items],
  );

  const load = useCallback(async () => {
    try {
      const { items } = await fetchNotifications();
      setItems(items);
      setListState("ready");
    } catch {
      setListState("error");
    }
  }, []);

  const reload = useCallback(() => {
    setListState("loading");
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;

    // Initial fetch on mount; setState happens asynchronously inside load().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();

    let wasErrored = false;
    const es = new EventSource("/api/notifications/stream");

    es.onopen = () => {
      setConn("open");
      // Resync after a reconnect so events missed while offline aren't lost.
      if (wasErrored) {
        wasErrored = false;
        void load();
      }
    };
    es.addEventListener("notification", (e) => {
      try {
        const n = JSON.parse((e as MessageEvent).data) as ClientNotification;
        setItems((prev) =>
          prev.some((x) => x.id === n.id) ? prev : [n, ...prev],
        );
      } catch {
        /* ignore malformed frame */
      }
    });
    es.onerror = () => {
      // EventSource retries on its own — surface a calm "reconnecting", not an
      // error flash. Offline lands here too and recovers when the link returns.
      wasErrored = true;
      setConn("reconnecting");
    };

    return () => es.close();
  }, [enabled, load]);

  const markOneRead = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isRead: true } : i)),
    );
    apiMarkRead(id).catch(() => void load());
  }, [load]);

  const markAllAsRead = useCallback(() => {
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
    apiMarkAllRead().catch(() => void load());
  }, [load]);

  return { items, unread, listState, conn, markOneRead, markAllAsRead, reload };
}
