import webpush from "web-push";

/**
 * Shared web-push instance. VAPID details are configured ONCE here from env so
 * the subscribe flow and the (later) send path use the same source of truth.
 *
 * ⚠️ nodejs runtime only — web-push relies on Node's crypto. Any route or
 * module importing this must `export const runtime = "nodejs"`.
 *
 * The guard keeps module import from throwing when env isn't set yet (e.g. a
 * Vercel deploy before the VAPID vars are added); sending simply no-ops/fails
 * gracefully until the keys exist.
 */
const subject = process.env.VAPID_SUBJECT;
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

export const vapidConfigured = Boolean(subject && publicKey && privateKey);

if (vapidConfigured) {
  webpush.setVapidDetails(subject!, publicKey!, privateKey!);
}

export { webpush };
