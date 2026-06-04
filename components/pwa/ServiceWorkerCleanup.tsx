"use client";

import { useEffect } from "react";

/**
 * Dev-only safety net for "sticky" service workers.
 *
 * next-pwa is disabled in development (see `disable` in next.config.ts), so a
 * fresh dev run never registers a service worker. But an SW registered by a
 * PREVIOUS production build (`npm run build && npm start`) — or by a dev run
 * from before `disable` was added — survives in the browser and keeps
 * intercepting requests on this origin: slow navigations (its NetworkFirst
 * rule + 5s timeout) and stale/missing images (StaleWhileRevalidate). This
 * effect evicts any such leftover so dev loads clean.
 *
 * Production is a no-op: `process.env.NODE_ENV` is inlined at build time, so
 * in a prod build the whole body is dead code and the real PWA service worker
 * stays active and untouched.
 *
 * Scope: touches ONLY service-worker registrations and the Cache Storage API.
 * It does NOT touch IndexedDB / Dexie — that is the app's offline data store,
 * not an SW cache, and `caches.delete()` can never reach it.
 */
export function ServiceWorkerCleanup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    // SSR / non-browser guard (also redundant-safe inside useEffect).
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((reg) => reg.unregister())),
        )
        .catch(() => {
          /* best-effort — nothing to do if the browser refuses */
        });
    }

    // Cache Storage only. NOT IndexedDB — Dexie is left completely alone.
    if (typeof caches !== "undefined") {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => {
          /* best-effort */
        });
    }
  }, []);

  return null;
}
