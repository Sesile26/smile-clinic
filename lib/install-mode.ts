/**
 * Which install affordance fits this client. Android/desktop Chromium is NOT
 * decided here — it's driven by the native `beforeinstallprompt` event (returns
 * "none" so the component waits for that event instead of guessing from UA).
 *
 *   "standalone" → already installed (running as an app) → show nothing
 *   "ios"        → iOS Safari → show manual "Add to Home Screen" instructions
 *   "none"       → everything else (Chromium handles via beforeinstallprompt)
 */
export function installMode(
  ua: string,
  standalone: boolean,
): "standalone" | "ios" | "none" {
  if (standalone) return "standalone";
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  // On iOS every browser is WebKit, but only Safari can install. Chrome/Firefox/
  // Edge on iOS (CriOS/FxiOS/EdgiOS) can't — exclude them.
  const isNonSafariIOS = /crios|fxios|edgios/i.test(ua);
  if (isIOS && !isNonSafariIOS) return "ios";
  return "none";
}
