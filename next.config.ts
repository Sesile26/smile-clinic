import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import type { RuntimeCaching } from "workbox-build";

/**
 * Workbox runtimeCaching for SmileClinic.
 *
 * Order matters — Workbox uses the FIRST matching route. All DENY rules
 * (NetworkOnly) must come before the broader allow rules.
 *
 * Hard rule: the service worker caches CODE, not user data. Any endpoint
 * that returns session state or per-user records is NetworkOnly. Offline
 * read of mirrored data goes through Dexie, not through the SW cache.
 */
const runtimeCaching: RuntimeCaching[] = [
  // ─── DENY: Auth.js endpoints ─────────────────────────────────────────────
  // Sessions, CSRF, providers list, callbacks — never cache, always live.
  {
    urlPattern: /^\/api\/auth\/.*/i,
    handler: "NetworkOnly",
  },
  // ─── DENY: Registration ──────────────────────────────────────────────────
  {
    urlPattern: /^\/api\/register(\/.*)?$/i,
    handler: "NetworkOnly",
  },
  // ─── DENY: Per-user / clinical data routes ───────────────────────────────
  // We never want a previous user's data served from cache to the next user
  // on a shared device. Mirror endpoint included — Dexie is the offline read
  // path, not the SW cache.
  {
    urlPattern: /^\/api\/(appointments|patients|doctors|mirror)(\/.*)?$/i,
    handler: "NetworkOnly",
  },
  // ─── DENY: RSC payloads ──────────────────────────────────────────────────
  // App Router fetches `?_rsc=...` for client-side navigations. These render
  // server-side, so they can carry the current user's session-scoped data.
  {
    urlPattern: ({ url }: { url: URL }) => url.searchParams.has("_rsc"),
    handler: "NetworkOnly",
  },

  // ─── ALLOW: Hashed Next.js build artefacts ───────────────────────────────
  // `/_next/static/*` filenames include content hashes ⇒ safe to cache long.
  {
    urlPattern: /^\/_next\/static\/.*/i,
    handler: "CacheFirst",
    options: {
      cacheName: "next-static",
      expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
    },
  },
  // ─── ALLOW: Google Fonts ─────────────────────────────────────────────────
  {
    urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
    handler: "CacheFirst",
    options: {
      cacheName: "google-fonts",
      expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
  // ─── ALLOW: PWA icons + brand SVGs in /public ────────────────────────────
  {
    urlPattern: /^\/icons\/.*\.(?:png|svg|ico)$/i,
    handler: "CacheFirst",
    options: {
      cacheName: "static-icons",
      expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
    },
  },
  // ─── ALLOW: Other same-origin images ─────────────────────────────────────
  {
    urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif)$/i,
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "images",
      expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
    },
  },
  // ─── ALLOW: Navigations (HTML routes) ────────────────────────────────────
  // Network-first so a fresh deploy is picked up; falls back to the offline
  // shell only when actually offline. Per-user pages still hit the network
  // first, so we don't surface stale auth-gated HTML.
  {
    urlPattern: ({ request }: { request: Request }) =>
      request.mode === "navigate",
    handler: "NetworkFirst",
    options: {
      cacheName: "pages",
      networkTimeoutSeconds: 5,
      expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 },
    },
  },
];

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  reloadOnOnline: true,

  // Static files under /public/api/** would otherwise be precached; we don't
  // ship any, but the exclusion belt-and-braces guards against future drift.
  publicExcludes: ["!api/**"],

  // Offline shell — shown when a navigation request fails the network check.
  fallbacks: {
    document: "/offline",
  },

  workboxOptions: {
    // Keep the precache list lean. Workbox precaches all .next build assets
    // by default; this skips obvious non-runtime files.
    exclude: [/\.map$/, /^manifest.*\.js$/],
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching,
  },
});

const nextConfig: NextConfig = {
  turbopack: {},
};

export default withPWA(nextConfig);
