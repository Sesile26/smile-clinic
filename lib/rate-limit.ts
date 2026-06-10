/**
 * Tiny in-memory fixed-window rate limiter.
 *
 * ⚠️ LIMITATION: per-process only — counters live in this Node instance's
 * memory and do NOT survive a restart or work across multiple instances /
 * serverless functions. Good enough for a single VPS/dev. To scale, swap this
 * for Redis/Upstash (e.g. INCR + EXPIRE) — the call sites stay the same.
 */

interface Bucket {
  count: number;
  resetAt: number; // epoch ms when the window rolls over
}

// Persist across dev hot-reloads so limits aren't reset on every edit.
const g = globalThis as unknown as { __rateBuckets?: Map<string, Bucket> };
const buckets = g.__rateBuckets ?? new Map<string, Bucket>();
g.__rateBuckets = buckets;

export interface RateResult {
  ok: boolean;
  /** Seconds until the window resets (for Retry-After / messaging). */
  retryAfterSec: number;
  remaining: number;
}

/**
 * Consume one hit for `key`. Allows up to `limit` hits per `windowMs`.
 * Lazily prunes the touched key; not a global GC, which is fine at this scale.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateResult {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: Math.ceil(windowMs / 1000), remaining: limit - 1 };
  }

  if (b.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  b.count += 1;
  return {
    ok: true,
    retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    remaining: limit - b.count,
  };
}
