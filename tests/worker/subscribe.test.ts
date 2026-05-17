/**
 * Integration tests for POST /api/subscribe.
 * Uses better-sqlite3 as a D1 stand-in and a stub email sender.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { handleSubscribe } from '../../worker/routes/subscribe';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(readFileSync('./migrations/0001_initial_schema.sql', 'utf8'));
  return db;
}

/** Minimal D1-compatible shim around better-sqlite3 */
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

/** Stub email sender — records calls, never throws */
function makeEmailStub() {
  const calls: Array<{ to: string; subject: string }> = [];
  return {
    sent: calls,
    send: async (to: string, subject: string, _html: string) => {
      calls.push({ to, subject });
    },
  };
}

describe('POST /api/subscribe', () => {
  let db: ReturnType<typeof d1>;
  let emailStub: ReturnType<typeof makeEmailStub>;

  beforeEach(() => {
    db = d1(makeDb());
    emailStub = makeEmailStub();
  });

  it('returns 400 for missing email', async () => {
    const req = new Request('http://localhost/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'en' }),
    });
    const res = await handleSubscribe(req, db as any, emailStub.send);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBeDefined();
  });

  it('returns 400 for invalid email format', async () => {
    const req = new Request('http://localhost/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', language: 'en' }),
    });
    const res = await handleSubscribe(req, db as any, emailStub.send);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe('invalid_email');
  });

  it('returns 200 and inserts pending subscriber for valid email', async () => {
    const req = new Request('http://localhost/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sub@example.com', language: 'en' }),
    });
    const res = await handleSubscribe(req, db as any, emailStub.send);
    expect(res.status).toBe(200);

    const rawDb = makeDb();
    rawDb.exec(readFileSync('./migrations/0001_initial_schema.sql', 'utf8'));
    // Re-check via our shim
    const row = (db as any).prepare('SELECT email, verified_at FROM subscribers WHERE email = ?').bind('sub@example.com').first();
    expect(row?.email).toBe('sub@example.com');
    expect(row?.verified_at).toBeNull();

    const link = (db as any).prepare('SELECT purpose FROM magic_links WHERE email = ?').bind('sub@example.com').first();
    expect(link?.purpose).toBe('subscribe');
  });

  it('sends a magic-link email for valid submission', async () => {
    const req = new Request('http://localhost/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sub2@example.com', language: 'zh' }),
    });
    await handleSubscribe(req, db as any, emailStub.send);
    expect(emailStub.sent).toHaveLength(1);
    expect(emailStub.sent[0].to).toBe('sub2@example.com');
  });

  it('is idempotent for repeated valid submission (upsert)', async () => {
    const makeReq = () => new Request('http://localhost/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'idem@example.com', language: 'en' }),
    });
    const r1 = await handleSubscribe(makeReq(), db as any, emailStub.send);
    const r2 = await handleSubscribe(makeReq(), db as any, emailStub.send);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it('does NOT overwrite language for an existing subscriber on re-subscribe', async () => {
    // Simulate a verified subscriber with language=zh who re-subscribes with language=en.
    // The subscribe route must NOT mutate the existing verified subscriber's language.
    const rawDb2 = makeDb();
    const db2 = d1(rawDb2);
    rawDb2.prepare("INSERT INTO subscribers (email, language, verified_at) VALUES (?, ?, datetime('now'))")
      .run('existing@example.com', 'zh');

    const req = new Request('http://localhost/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'existing@example.com', language: 'en' }),
    });
    await handleSubscribe(req, db2 as any, emailStub.send);

    const row = rawDb2.prepare('SELECT language FROM subscribers WHERE email = ?').get('existing@example.com') as any;
    expect(row?.language).toBe('zh'); // preserved — not overwritten to 'en'
  });
});
