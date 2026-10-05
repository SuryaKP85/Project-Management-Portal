import { Request, Response, NextFunction } from 'express';

/**
 * Sprint 7A (Step 3) — minimal per-user rate limiter.
 *
 * Fixed-window counter held in process memory. No external dependency, and
 * deterministic: a given number of calls inside one window always produces the
 * same outcome, which keeps it testable.
 *
 * Scope note: state is per-process, so this bounds accidental runaway usage and
 * caps cost on a single instance. It is not a distributed quota and would need
 * shared storage behind multiple instances.
 */

interface WindowState {
  count: number;
  windowStart: number;
}

export interface RateLimitOptions {
  /** Maximum requests permitted per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Bucket name, so separate routes can hold independent counters. */
  bucket: string;
}

const buckets: Map<string, Map<string, WindowState>> = new Map();

function getBucket(name: string): Map<string, WindowState> {
  let bucket = buckets.get(name);
  if (!bucket) {
    bucket = new Map();
    buckets.set(name, bucket);
  }
  return bucket;
}

/** Drop windows that have already expired, so the map cannot grow unbounded. */
function pruneExpired(bucket: Map<string, WindowState>, now: number, windowMs: number) {
  for (const [key, state] of bucket) {
    if (now - state.windowStart >= windowMs) {
      bucket.delete(key);
    }
  }
}

/**
 * Clears rate-limit state. Intended for tests and for verification runs so that
 * successive checks start from a known position.
 */
export function resetRateLimits(bucketName?: string) {
  if (bucketName) {
    buckets.delete(bucketName);
    return;
  }
  buckets.clear();
}

export function rateLimit(options: RateLimitOptions) {
  const { max, windowMs, bucket: bucketName } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Keyed on the authenticated user. This middleware is always mounted after
    // authenticateToken, so req.user is present; the fallback is defensive.
    const key = req.user?.userId || 'anonymous';
    const bucket = getBucket(bucketName);
    const now = Date.now();

    pruneExpired(bucket, now, windowMs);

    let state = bucket.get(key);
    if (!state || now - state.windowStart >= windowMs) {
      state = { count: 0, windowStart: now };
      bucket.set(key, state);
    }

    state.count += 1;

    const remaining = Math.max(0, max - state.count);
    const resetInSeconds = Math.ceil((state.windowStart + windowMs - now) / 1000);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(resetInSeconds));

    if (state.count > max) {
      res.setHeader('Retry-After', String(resetInSeconds));
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Too many AI requests. Limit is ${max} per ${Math.round(windowMs / 1000)}s. Try again in ${resetInSeconds}s.`,
        },
      });
    }

    next();
  };
}

// --------------------------------------------------------------------
// Sprint 20 — failed sign-in limiter (same fixed-window buckets).
//
// Only failures count. Per account+IP: LOGIN_RATE_LIMIT_MAX failures (default
// 5) per LOGIN_RATE_LIMIT_WINDOW_MS (default 15 minutes); per IP across all
// accounts: four times that. When either is reached, sign-in attempts get 429
// with Retry-After until the window ends — nothing is locked permanently. A
// successful sign-in clears the account+IP counter.
// --------------------------------------------------------------------

const LOGIN_BUCKET = 'login-failures';
const LOGIN_IP_BUCKET = 'login-failures-ip';

export function loginLimits() {
  const max = Math.max(1, Number(process.env.LOGIN_RATE_LIMIT_MAX) || 5);
  const windowMs = Math.max(1000, Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60_000);
  return { max, ipMax: max * 4, windowMs };
}

const accountKey = (ip: string, email: string) => `${ip}|${email.trim().toLowerCase()}`;

/** Seconds until sign-in may be tried again, or 0 when it is allowed now. */
export function loginRetryAfter(ip: string, email: string, now = Date.now()): number {
  const { max, ipMax, windowMs } = loginLimits();
  let wait = 0;
  for (const [bucketName, key, limit] of [[LOGIN_BUCKET, accountKey(ip, email), max], [LOGIN_IP_BUCKET, ip, ipMax]] as const) {
    const bucket = getBucket(bucketName);
    pruneExpired(bucket, now, windowMs);
    const state = bucket.get(key);
    if (state && state.count >= limit) wait = Math.max(wait, Math.ceil((state.windowStart + windowMs - now) / 1000));
  }
  return wait;
}

export function recordLoginFailure(ip: string, email: string, now = Date.now()): void {
  for (const [bucketName, key] of [[LOGIN_BUCKET, accountKey(ip, email)], [LOGIN_IP_BUCKET, ip]] as const) {
    const bucket = getBucket(bucketName);
    const state = bucket.get(key);
    if (state) state.count += 1;
    else bucket.set(key, { count: 1, windowStart: now });
  }
}

export function clearLoginFailures(ip: string, email: string): void {
  getBucket(LOGIN_BUCKET).delete(accountKey(ip, email));
}
