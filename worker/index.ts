/// <reference lib="webworker" />

/**
 * Custom service-worker code. @ducanh2912/next-pwa (customWorkerSrc defaults to
 * "worker") compiles this and `importScripts`-es it into the generated sw.js —
 * so it runs ALONGSIDE Workbox, it does not replace it.
 *
 * Two handlers, both needed for Web Push to actually show + be clickable:
 *  - "push":            render the notification from the server payload.
 *  - "notificationclick": focus an open app tab (or open one) at the link.
 *
 * Android only for now (Chrome, tab or installed). iOS needs an installed PWA
 * on 16.4+; we don't special-case it here — these handlers are harmless there.
 *
 * Typed via a cast (not `declare const self`) so it doesn't clash with the lib's
 * own `self`. This file is excluded from the app tsconfig and checked by
 * worker/tsconfig.json (webworker lib); next-pwa transpiles it separately.
 */

const sw = self as unknown as ServiceWorkerGlobalScope;

interface PushPayload {
  title?: string;
  body?: string;
  link?: string;
  icon?: string;
}

sw.addEventListener("push", (event: PushEvent) => {
  let data: PushPayload = {};
  try {
    if (event.data) data = event.data.json() as PushPayload;
  } catch {
    // payload не JSON / порожній — лишаємо {}, спрацює fallback-текст нижче.
  }

  const title = data.title || "SmileClinic";
  const options: NotificationOptions = {
    body: data.body || "Нове сповіщення",
    icon: data.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    // link читає notificationclick.
    data: { link: data.link || "/" },
  };

  event.waitUntil(sw.registration.showNotification(title, options));
});

sw.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const link =
    (event.notification.data as { link?: string } | undefined)?.link || "/";
  const url = new URL(link, sw.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientList = await sw.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Вже відкрита вкладка застосунку → фокус (+ навігація на link).
      for (const client of clientList) {
        await client.focus();
        if ("navigate" in client && client.url !== url) {
          try {
            await client.navigate(url);
          } catch {
            /* крос-оріджин / заборонено — лишаємо як є */
          }
        }
        return;
      }
      // Жодної відкритої вкладки → відкрити нову на link (або головну).
      await sw.clients.openWindow(url);
    })(),
  );
});
