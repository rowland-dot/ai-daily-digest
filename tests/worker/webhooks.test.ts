/**
 * Integration tests for POST /api/webhooks/beehiiv.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { handleWebhook } from '../../worker/routes/webhooks';

const WEBHOOK_SECRET = 'test-webhook-secret-32bytes-xxxxxxx';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(readFileSync('./migrations/0001_initial_schema.sql', 'utf8'));
  return db;
}

function d1(db: InstanceType<typeof Database>) {
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      return {
        bind(...args: unknown[]) {
          return {
            run: () => stmt.run(...(args as any[])),
            first: () => stmt.get(...(args as any[])),
            all: () => ({ results: stmt.all(...(args as any[])) }),
          };
        },
      };
    },
    exec(sql: string) { db.exec(sql); },
  };
}

/** Compute HMAC-SHA256 hex signature for a payload string */
async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('POST /api/webhooks/beehiiv', () => {
  let rawDb: InstanceType<typeof Database>;
  let db: ReturnType<typeof d1>;

  beforeEach(() => {
    rawDb = makeDb();
    db = d1(rawDb);
    rawDb.prepare('INSERT INTO subscribers (email) VALUES (?)').run('webhook@example.com');
  });

  it('returns 401 for missing signature header', async () => {
    const body = JSON.stringify({ type: 'subscriber.unsubscribed', data: { email: 'webhook@example.com' } });
    const req = new Request('http://localhost/api/webhooks/beehiiv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const res = await handleWebhook(req, db as any, WEBHOOK_SECRET);
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid signature', async () => {
    const body = JSON.stringify({ type: 'subscriber.unsubscribed', data: { email: 'webhook@example.com' } });
    const req = new Request('http://localhost/api/webhooks/beehiiv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Beehiiv-Signature': 'bad-sig' },
      body,
    });
    const res = await handleWebhook(req, db as any, WEBHOOK_SECRET);
    expect(res.status).toBe(401);
  });

  it('returns 200 and sets unsubscribed_at for valid subscriber.unsubscribed event', async () => {
    const payload = JSON.stringify({ type: 'subscriber.unsubscribed', data: { email: 'webhook@example.com' } });
    const sig = await signPayload(payload, WEBHOOK_SECRET);
    const req = new Request('http://localhost/api/webhooks/beehiiv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Beehiiv-Signature': sig },
      body: payload,
    });
    const res = await handleWebhook(req, db as any, WEBHOOK_SECRET);
    expect(res.status).toBe(200);

    const row = rawDb.prepare('SELECT unsubscribed_at FROM subscribers WHERE email = ?').get('webhook@example.com') as any;
    expect(row?.unsubscribed_at).not.toBeNull();
  });

  it('returns 200 for unknown event type (no-op)', async () => {
    const payload = JSON.stringify({ type: 'subscriber.created', data: { email: 'webhook@example.com' } });
    const sig = await signPayload(payload, WEBHOOK_SECRET);
    const req = new Request('http://localhost/api/webhooks/beehiiv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Beehiiv-Signature': sig },
      body: payload,
    });
    const res = await handleWebhook(req, db as any, WEBHOOK_SECRET);
    expect(res.status).toBe(200);
  });

  it('no-ops signature check when secret is absent (test environment)', async () => {
    const payload = JSON.stringify({ type: 'subscriber.unsubscribed', data: { email: 'webhook@example.com' } });
    const req = new Request('http://localhost/api/webhooks/beehiiv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    // Pass undefined secret — should skip signature verification
    const res = await handleWebhook(req, db as any, undefined);
    expect(res.status).toBe(200);
  });
});
