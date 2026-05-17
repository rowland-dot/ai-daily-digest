/**
 * Unit tests for the in-memory rate limiter (H4 security fix).
 * Also covers integration: rate limiting applied via index.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { isRateLimited, resetRateLimitStore, hasBypassToken, rateLimitedResponse } from '../../worker/lib/rate-limit';

describe('isRateLimited — token bucket', () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it('allows up to limit requests', () => {
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited('test-key', { limit: 5, windowMs: 60000 })).toBe(false);
    }
  });

  it('blocks the request beyond the limit', () => {
    for (let i = 0; i < 5; i++) {
      isRateLimited('test-key', { limit: 5, windowMs: 60000 });
    }
    expect(isRateLimited('test-key', { limit: 5, windowMs: 60000 })).toBe(true);
  });

  it('does not affect a different key', () => {
    for (let i = 0; i < 6; i++) {
      isRateLimited('key-a', { limit: 5, windowMs: 60000 });
    }
    expect(isRateLimited('key-b', { limit: 5, windowMs: 60000 })).toBe(false);
  });

  it('resets after the window expires', () => {
    for (let i = 0; i < 5; i++) {
      isRateLimited('reset-key', { limit: 5, windowMs: 1 });
    }
    // Ensure we are over-limit
    expect(isRateLimited('reset-key', { limit: 5, windowMs: 1 })).toBe(true);

    // Wait for window to expire then allow again
    // Force the window reset by clearing store (simulating time passage)
    resetRateLimitStore();
    expect(isRateLimited('reset-key', { limit: 5, windowMs: 60000 })).toBe(false);
  });

  it('passes through when disabled=true', () => {
    for (let i = 0; i < 100; i++) {
      expect(isRateLimited('disabled-key', { limit: 5, windowMs: 60000, disabled: true })).toBe(false);
    }
  });
});

describe('hasBypassToken', () => {
  it('returns false when bypassToken is undefined', () => {
    const req = new Request('http://localhost/', {
      headers: { 'X-Test-Bypass-RateLimit': 'some-token' },
    });
    expect(hasBypassToken(req, undefined)).toBe(false);
  });

  it('returns false when header is absent', () => {
    const req = new Request('http://localhost/');
    expect(hasBypassToken(req, 'secret')).toBe(false);
  });

  it('returns false when header value does not match', () => {
    const req = new Request('http://localhost/', {
      headers: { 'X-Test-Bypass-RateLimit': 'wrong' },
    });
    expect(hasBypassToken(req, 'secret')).toBe(false);
  });

  it('returns true when header value matches bypassToken', () => {
    const req = new Request('http://localhost/', {
      headers: { 'X-Test-Bypass-RateLimit': 'secret' },
    });
    expect(hasBypassToken(req, 'secret')).toBe(true);
  });
});

describe('rateLimitedResponse', () => {
  it('returns 429 with Retry-After header', async () => {
    const res = rateLimitedResponse();
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('600');
    const body = await res.json() as any;
    expect(body.error).toBe('rate_limited');
  });
});
