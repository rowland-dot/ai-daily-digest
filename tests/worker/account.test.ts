/**
 * Integration tests for account routes:
 *   POST /api/account/unsubscribe
 *   PUT  /api/account/language
 *   POST /api/account/delete
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { signSession } from '../../worker/lib/auth';
import { handleAccount } from '../../worker/routes/account';

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

describe('POST /api/account/unsubscribe', () => {
  let rawDb: InstanceType<typeof Database>;
  let db: ReturnType<typeof d1>;
  let cookie: string;

  beforeEach(async () => {
    rawDb = makeDb();
    db = d1(rawDb);
    rawDb.prepare('INSERT INTO subscribers (email, verified_at) VALUES (?, ?)').run('acct@example.com', new Date().toISOString());
    cookie = await signSession('acct@example.com', SECRET);
  });

  it('returns 401 with no cookie', async () => {
    const req = new Request('http://localhost/api/account/unsubscribe', { method: 'POST' });
    const res = await handleAccount(req, db as any, SECRET, '', '');
    expect(res.status).toBe(401);
  });

  it('returns 200 and sets unsubscribed_at', async () => {
    const req = new Request('http://localhost/api/account/unsubscribe', {
      method: 'POST',
      headers: { Cookie: `session=${cookie}` },
    });
    const res = await handleAccount(req, db as any, SECRET, '', '');
    expect(res.status).toBe(200);
    const row = rawDb.prepare('SELECT unsubscribed_at FROM subscribers WHERE email = ?').get('acct@example.com') as any;
    expect(row?.unsubscribed_at).not.toBeNull();
  });
});

describe('PUT /api/account/language', () => {
  let rawDb: InstanceType<typeof Database>;
  let db: ReturnType<typeof d1>;
  let cookie: string;

  beforeEach(async () => {
    rawDb = makeDb();
    db = d1(rawDb);
    rawDb.prepare('INSERT INTO subscribers (email) VALUES (?)').run('lang@example.com');
    cookie = await signSession('lang@example.com', SECRET);
  });

  it('returns 401 with no cookie', async () => {
    const req = new Request('http://localhost/api/account/language', { method: 'PUT' });
    const res = await handleAccount(req, db as any, SECRET, '', '');
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid language value', async () => {
    const req = new Request('http://localhost/api/account/language', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: `session=${cookie}` },
      body: JSON.stringify({ language: 'fr' }),
    });
    const res = await handleAccount(req, db as any, SECRET, '', '');
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe('invalid_language');
  });

  it('returns 200 and updates language in DB', async () => {
    const req = new Request('http://localhost/api/account/language', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: `session=${cookie}` },
      body: JSON.stringify({ language: 'zh' }),
    });
    const res = await handleAccount(req, db as any, SECRET, '', '');
    expect(res.status).toBe(200);
    const row = rawDb.prepare('SELECT language FROM subscribers WHERE email = ?').get('lang@example.com') as any;
    expect(row?.language).toBe('zh');
  });
});

describe('POST /api/account/delete', () => {
  let rawDb: InstanceType<typeof Database>;
  let db: ReturnType<typeof d1>;
  let cookie: string;

  beforeEach(async () => {
    rawDb = makeDb();
    db = d1(rawDb);
    rawDb.prepare('INSERT INTO subscribers (email) VALUES (?)').run('del@example.com');
    rawDb.prepare('INSERT INTO favourites (email, article_id) VALUES (?, ?)').run('del@example.com', 'aihot-a3f12b8c');
    rawDb.prepare('INSERT INTO magic_links (token, email, purpose, expires_at) VALUES (?, ?, ?, ?)').run('tok1', 'del@example.com', 'subscribe', new Date(Date.now() + 999999).toISOString());
    cookie = await signSession('del@example.com', SECRET);
  });

  it('returns 401 with no cookie', async () => {
    const req = new Request('http://localhost/api/account/delete', { method: 'POST' });
    const res = await handleAccount(req, db as any, SECRET, '', '');
    expect(res.status).toBe(401);
  });

  it('returns 403 when X-Requested-With header is missing (CSRF guard)', async () => {
    // Authenticated but no CSRF header — simulates cross-site form POST
    const req = new Request('http://localhost/api/account/delete', {
      method: 'POST',
      headers: { Cookie: `session=${cookie}` },
    });
    const res = await handleAccount(req, db as any, SECRET, '', '');
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toBe('csrf_check_failed');
  });

  it('returns 403 when X-Requested-With has wrong value', async () => {
    const req = new Request('http://localhost/api/account/delete', {
      method: 'POST',
      headers: { Cookie: `session=${cookie}`, 'X-Requested-With': 'XMLHttpRequest' },
    });
    const res = await handleAccount(req, db as any, SECRET, '', '');
    expect(res.status).toBe(403);
  });

  it('returns 200 and removes all subscriber data', async () => {
    const req = new Request('http://localhost/api/account/delete', {
      method: 'POST',
      headers: { Cookie: `session=${cookie}`, 'X-Requested-With': 'account-delete' },
    });
    const res = await handleAccount(req, db as any, SECRET, '', '');
    expect(res.status).toBe(200);

    expect(rawDb.prepare('SELECT email FROM subscribers WHERE email = ?').get('del@example.com')).toBeUndefined();
    expect(rawDb.prepare('SELECT email FROM favourites WHERE email = ?').get('del@example.com')).toBeUndefined();
    expect(rawDb.prepare('SELECT token FROM magic_links WHERE email = ?').get('del@example.com')).toBeUndefined();
  });

  it('clears session cookie on delete', async () => {
    const req = new Request('http://localhost/api/account/delete', {
      method: 'POST',
      headers: { Cookie: `session=${cookie}`, 'X-Requested-With': 'account-delete' },
    });
    const res = await handleAccount(req, db as any, SECRET, '', '');
    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain('session=');
    expect(setCookie).toContain('Max-Age=0');
  });
});
