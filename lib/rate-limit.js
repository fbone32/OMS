// Minimal best-effort in-memory rate limiter. This is NOT a substitute for a
// real shared store (Upstash/Redis) — on serverless each warm instance keeps
// its own counters, and a cold start resets them — but it costs nothing to
// wire up and meaningfully slows down a single scripted client hammering one
// warm lambda, which is a proportionate amount of defense for an internal
// demo app's low-sensitivity lookup endpoint (see app/api/auth/role-hint).
const buckets = new Map();

// Keep the map from growing unbounded across a long-lived warm instance.
const MAX_TRACKED_KEYS = 5000;

/** Returns true if `key` is still within its rate limit, false if it should
 * be rejected. `limit` requests per `windowMs` milliseconds, sliding-window-
 * ish (fixed window, reset on expiry — good enough for this purpose). */
function checkRateLimit(key, { limit = 20, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear();
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

/** Best-effort client identifier from a Next.js Request in a Vercel function
 * (behind Vercel's edge network, which always sets x-forwarded-for). */
function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

module.exports = { checkRateLimit, clientIp };
