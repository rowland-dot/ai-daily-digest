/**
 * Simple in-memory per-IP token-bucket rate limiter.
 *
 * Limits: 5 requests per 10 minutes per (IP, route) key.
 *
 * In a Cloudflare Workers deployment each isolate is single-tenant so the
 * in-memory map is per-instance. For a D1-backed implementation (safer
 * across restarts and scale-out) replace the map with a D1 rate_limits table.
 *
 * Test bypass: set env var RATE_LIMIT_DISABLED=true, or send the header
 * X-Test-Bypass-RateLimit: <RATE_LIMIT_BYPASS_TOKEN> where the token matches
 * the RATE_LIMIT_BYPASS_TOKEN env var (only effective when the var is set).
 */

export interface RateLimitOptions {
  /** Maximum requests in the window */
  limit?: number;
  /** Window length in milliseconds */
  windowMs?: number;
  /** If true, all requests pass through (test environments) */
  disabled?: boolean;
  /** When set, requests with header X-Test-Bypass-RateLimit matching this value pass through */
  bypassToken?: string;
}

interface BucketEntry {
  count: number;
  windowStart: number;
}

// Module-level store; survives across requests within an isolate lifetime.
const store = new Map<string, BucketEntry>();

/**
 * Check whether a request should be rate-limited.
 *
 * @param key    Unique key for the bucket (e.g. "<ip>:<route>")
 * @param opts   Limit options
 * @returns true if the request should be blocked (limit exceeded)
 */
export function isRateLimited(key: string, opts: RateLimitOptions = {}): boolean {
  const { limit = 5, windowMs = 10 * 60 * 1000, disabled = false } = opts;
  if (disabled) return false;

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    // New window
    store.set(key, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  if (entry.count > limit) {
    return true;
  }
  return false;
}

/**
 * Determine whether the request carries a valid bypass token.
 * A bypass token is only accepted when RATE_LIMIT_BYPASS_TOKEN is set in env.
 */
export function hasBypassToken(request: Request, bypassToken: string | undefined): boolean {
  if (!bypassToken) return false;
  return request.headers.get('X-Test-Bypass-RateLimit') === bypassToken;
}

/**
 * Extract the client IP from a Cloudflare Workers request.
 * Falls back to 'unknown' when not available (e.g. in tests).
 */
export function clientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ??
    'unknown'
  );
}

/** Standard 429 response */
export function rateLimitedResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'rate_limited', message: 'Too many requests — please try again later' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '600',
      },
    },
  );
}

/** Reset the in-memory store (for test isolation) */
export function resetRateLimitStore(): void {
  store.clear();
}
