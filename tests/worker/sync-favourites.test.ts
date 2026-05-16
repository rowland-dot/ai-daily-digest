/**
 * Integration tests for POST /api/sync-favourites.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { handleSyncFavourites } from '../../worker/routes/sync-favourites';

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

function makeEmailStub() {
  const calls: Array<{ to: string; subject: string }> = [];
  return {
    sent: calls,
    send: async (to: string, subject: string, _html: string) => {
      calls.push({ to, subject });
    },
  };
}

describe('POST /api/sync-favourites', () => {
  let rawDb: InstanceType<typeof Database>;
  let db: ReturnType<typeof d1>;
  let emailStub: ReturnType<typeof makeEmailStub>;

  beforeEach(() => {
    rawDb = makeDb();
    db = d1(rawDb);
    emailStub = makeEmailStub();
  });

  it('returns 400 for missing email', async () => {
    const req = new Request('http://localhost/api/sync-favourites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await handleSyncFavourites(req, db as any, emailStub.send, 'https://example.com');
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBeDefined();
  });

  it('returns 400 for invalid email format', async () => {
    const req = new Request('http://localhost/api/sync-favourites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    const res = await handleSyncFavourites(req, db as any, emailStub.send, 'https://example.com');
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe('invalid_email');
  });

  it('returns 200 and inserts magic link with restore-favourites purpose', async () => {
    const req = new Request('http://localhost/api/sync-favourites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sync@example.com' }),
    });
    const res = await handleSyncFavourites(req, db as any, emailStub.send, 'https://example.com');
    expect(res.status).toBe(200);

    const link = rawDb.prepare('SELECT purpose FROM magic_links WHERE email = ?').get('sync@example.com') as any;
    expect(link?.purpose).toBe('restore-favourites');
  });

  it('upserts subscriber when sending sync link', async () => {
    const req = new Request('http://localhost/api/sync-favourites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sync2@example.com' }),
    });
    await handleSyncFavourites(req, db as any, emailStub.send, 'https://example.com');

    const row = rawDb.prepare('SELECT email FROM subscribers WHERE email = ?').get('sync2@example.com') as any;
    expect(row?.email).toBe('sync2@example.com');
  });

  it('sends one email for valid submission', async () => {
    const req = new Request('http://localhost/api/sync-favourites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sync3@example.com' }),
    });
    await handleSyncFavourites(req, db as any, emailStub.send, 'https://example.com');
    expect(emailStub.sent).toHaveLength(1);
    expect(emailStub.sent[0].to).toBe('sync3@example.com');
  });
});
