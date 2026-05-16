/**
 * Integration tests for GET /api/auth/verify.
 * Uses better-sqlite3 as a D1 stand-in.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { handleAuthVerify } from '../../worker/routes/auth-verify';

const SECRET = 'test-secret-32-bytes-xxxxxxxxxxxxxxxxx';

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

describe('GET /api/auth/verify', () => {
  let rawDb: InstanceType<typeof Database>;
  let db: ReturnType<typeof d1>;

  beforeEach(() => {
    rawDb = makeDb();
    db = d1(rawDb);
    // Seed a subscriber
    rawDb.prepare('INSERT INTO subscribers (email) VALUES (?)').run('verify@example.com');
  });

  function insertToken(opts: {
    token: string;
    email: string;
    purpose: string;
    expiresAt: string;
    consumedAt?: string;
  }) {
    rawDb.prepare(
      'INSERT INTO magic_links (token, email, purpose, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?)'
    ).run(opts.token, opts.email, opts.purpose, opts.expiresAt, opts.consumedAt ?? null);
  }

  it('returns 302 redirect to /account?welcome=1 and sets cookie for valid subscribe token', async () => {
    const expiry = new Date(Date.now() + 1800000).toISOString();
    insertToken({ token: 'valid-token', email: 'verify@example.com', purpose: 'subscribe', expiresAt: expiry });

    const req = new Request('http://localhost/api/auth/verify?token=valid-token');
    const res = await handleAuthVerify(req, db as any, SECRET, 'https://example.com');

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/account');
    expect(res.headers.get('Set-Cookie')).toContain('session=');
    expect(res.headers.get('Set-Cookie')).toContain('HttpOnly');

    // verified_at should be set
    const row = rawDb.prepare('SELECT verified_at FROM subscribers WHERE email = ?').get('verify@example.com') as any;
    expect(row?.verified_at).not.toBeNull();

    // token should be consumed
    const link = rawDb.prepare('SELECT consumed_at FROM magic_links WHERE token = ?').get('valid-token') as any;
    expect(link?.consumed_at).not.toBeNull();
  });

  it('returns 302 to /favourites?welcome=1 for restore-favourites purpose', async () => {
    const expiry = new Date(Date.now() + 1800000).toISOString();
    insertToken({ token: 'fav-token', email: 'verify@example.com', purpose: 'restore-favourites', expiresAt: expiry });

    const req = new Request('http://localhost/api/auth/verify?token=fav-token');
    const res = await handleAuthVerify(req, db as any, SECRET, 'https://example.com');

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/favourites');
  });

  it('returns 400 for expired token', async () => {
    const expiry = new Date(Date.now() - 1000).toISOString(); // already expired
    insertToken({ token: 'expired-token', email: 'verify@example.com', purpose: 'subscribe', expiresAt: expiry });

    const req = new Request('http://localhost/api/auth/verify?token=expired-token');
    const res = await handleAuthVerify(req, db as any, SECRET, 'https://example.com');
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe('token_expired');
  });

  it('returns 400 for already-consumed token', async () => {
    const expiry = new Date(Date.now() + 1800000).toISOString();
    insertToken({ token: 'consumed-token', email: 'verify@example.com', purpose: 'subscribe', expiresAt: expiry, consumedAt: new Date().toISOString() });

    const req = new Request('http://localhost/api/auth/verify?token=consumed-token');
    const res = await handleAuthVerify(req, db as any, SECRET, 'https://example.com');
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe('token_consumed');
  });

  it('returns 404 for unknown token', async () => {
    const req = new Request('http://localhost/api/auth/verify?token=does-not-exist');
    const res = await handleAuthVerify(req, db as any, SECRET, 'https://example.com');
    expect(res.status).toBe(404);
  });

  it('returns 400 when token query param is missing', async () => {
    const req = new Request('http://localhost/api/auth/verify');
    const res = await handleAuthVerify(req, db as any, SECRET, 'https://example.com');
    expect(res.status).toBe(400);
  });
});
