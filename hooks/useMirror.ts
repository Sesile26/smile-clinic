"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { wipeDexie } from "@/lib/db";
import { pullMirror, type MirrorReason } from "@/lib/mirror";

export type MirrorStatus = "idle" | "syncing" | "error" | "offline";

export interface UseMirrorState {
  status: MirrorStatus;
  lastPullAt: number | null;
  retry: () => Promise<void>;
}

/**
 * Orchestrates the read-only Dexie mirror lifecycle:
 *
 *   - on sign-in (or user switch): pull a fresh slice.
 *   - on sign-out (session becomes "unauthenticated"): wipe Dexie.
 *   - on window `online` event: re-pull.
 *
 * Mounted exactly once near the top of the React tree (inside
 * SessionProvider). Returns state for any UI that wants to show a
 * "syncing…" / "offline" badge — otherwise the hook just runs.
 */
export function useMirror(): UseMirrorState {
  const { data: session, status: sessionStatus } = useSession();
  const userId = session?.user?.id;

  const [status, setStatus] = useState<MirrorStatus>("idle");
  const [lastPullAt, setLastPullAt] = useState<number | null>(null);

  const pull = useCallback(async () => {
    if (typeof window === "undefined") return;
    setStatus("syncing");
    const result = await pullMirror();
    if (result.ok) {
      setStatus("idle");
      setLastPullAt(Date.now());
      return;
    }
    const reason: MirrorReason | undefined = result.reason;
    setStatus(reason === "offline" ? "offline" : "error");
  }, []);

  // Pull whenever the signed-in user identity changes (login, account switch).
  useEffect(() => {
    if (sessionStatus !== "authenticated" || !userId) return;
    void pull();
  }, [sessionStatus, userId, pull]);

  // Wipe when the session goes away. Idempotent — safe to fire on every
  // transition into "unauthenticated".
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      void wipeDexie();
    }
  }, [sessionStatus]);

  // Re-pull when we come back online.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      if (sessionStatus === "authenticated") void pull();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [pull, sessionStatus]);

  return { status, lastPullAt, retry: pull };
}
