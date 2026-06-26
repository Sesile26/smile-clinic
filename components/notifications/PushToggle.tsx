"use client";

import { useEffect, useState } from "react";

/**
 * Unobtrusive "Увімкнути сповіщення" control, rendered inside the bell dropdown
 * (which itself shows only for logged-in users — so push stays bound to a
 * userId). Visibility:
 *   - shown ONLY when Web Push is supported AND permission is NOT yet granted
 *     and NOT blocked → a subscribed user sees nothing; a blocked user sees a
 *     short "how to unblock" hint instead of a nag.
 *   - already subscribed → a quiet "увімкнені / Вимкнути" row.
 *
 * Android (Chrome, tab or installed) works. iOS Safari without an installed PWA
 * lacks PushManager → "unsupported" → renders nothing (soft no-op, no error).
 */

/** VAPID public key (urlsafe base64) → Uint8Array for applicationServerKey. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Perm = "default" | "granted" | "denied" | "unsupported";

const linkBtn =
  "rounded-md px-2 py-1 text-xs font-medium text-mint-600 transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:text-navy-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint";

export function PushToggle() {
  const [perm, setPerm] = useState<Perm>("unsupported");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    if (!supported) return; // лишаємо "unsupported" → нічого не рендеримо
    // queueMicrotask: уникаємо sync-setState у тілі ефекту (react-hooks rule).
    queueMicrotask(() => setPerm(Notification.permission as Perm));
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  const enable = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = (await Notification.requestPermission()) as Perm;
      setPerm(result);
      if (result !== "granted") return; // denied/default → нижче покаже стан
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        setError("Push не налаштовано");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error("subscribe failed");
      setSubscribed(true);
    } catch {
      setError("Не вдалося увімкнути");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      /* best-effort — лишаємо як є */
    } finally {
      setBusy(false);
    }
  };

  if (perm === "unsupported") return null;

  const rowBase =
    "flex items-center justify-between gap-3 border-t border-[color:var(--line)] px-4 py-2.5";

  if (perm === "denied") {
    return (
      <div className={rowBase}>
        <span className="text-[11px] text-navy-400">
          Сповіщення заблоковано. Увімкніть їх для сайту в налаштуваннях браузера.
        </span>
      </div>
    );
  }

  if (perm === "granted" && subscribed) {
    return (
      <div className={rowBase}>
        <span className="text-xs text-navy-400">Сповіщення увімкнені</span>
        <button type="button" onClick={disable} disabled={busy} className={linkBtn}>
          Вимкнути
        </button>
      </div>
    );
  }

  // default, або granted без активної підписки → пропонуємо увімкнути.
  return (
    <div className={rowBase}>
      <span className="text-xs text-navy-400">
        {error ?? "Отримуйте сповіщення на цей пристрій"}
      </span>
      <button type="button" onClick={enable} disabled={busy} className={linkBtn}>
        {busy ? "…" : "Увімкнути"}
      </button>
    </div>
  );
}
