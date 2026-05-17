/**
 * Integration tests for the top-level worker fetch handler.
 * Covers the SESSION_SECRET guard (C1 security fix).
 */
import { describe, it, expect } from 'vitest';
import worker from '../../worker/index';

const BASE_ENV = {
  DB: null as any,
  SESSION_SECRET: 'test-secret-32-bytes-xxxxxxxxxxxxxxxxx',
  RESEND_API_KEY: '',
  BEEHIIV_API_KEY: '',
  BEEHIIV_PUB_ID: '',
  SITE_ORIGIN: 'https://example.com',
};

describe('worker fetch handler — SESSION_SECRET guard', () => {
  it('throws when SESSION_SECRET is absent', async () => {
    const req = new Request('http://localhost/api/subscribe', { method: 'POST' });
    const env = { ...BASE_ENV, SESSION_SECRET: '' };
    await expect(worker.fetch(req, env as any, {} as any)).rejects.toThrow(
      'SESSION_SECRET environment variable is required but not set',
    );
  });

  it('throws when SESSION_SECRET is undefined', async () => {
    const req = new Request('http://localhost/api/subscribe', { method: 'POST' });
    const env = { ...BASE_ENV, SESSION_SECRET: undefined as any };
    await expect(worker.fetch(req, env as any, {} as any)).rejects.toThrow(
      'SESSION_SECRET environment variable is required but not set',
    );
  });

  it('returns 404 for non-api path (SESSION_SECRET present)', async () => {
    const req = new Request('http://localhost/');
    const res = await worker.fetch(req, BASE_ENV as any, {} as any);
    expect(res.status).toBe(404);
  });
});
