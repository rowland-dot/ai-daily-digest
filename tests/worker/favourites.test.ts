/**
 * Integration tests for GET|POST|DELETE /api/favourites.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { signSession } from '../../worker/lib/auth';
import { handleFavourites } from '../../worker/routes/favourites';

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

const ORIGIN = 'https://example.com';

describe('GET /api/favourites', () => {
  let rawDb: InstanceType<typeof Database>;
  let db: ReturnType<typeof d1>;

  beforeEach(() => {
    rawDb = makeDb();
    db = d1(rawDb);
    rawDb.prepare('INSERT INTO subscribers (email) VALUES (?)').run('fav@example.com');
  });

  it('returns 401 with no session cookie', async () => {
    const req = new Request('http://localhost/api/favourites', { method: 'GET' });
    const res = await handleFavourites(req, db as any, SECRET, ORIGIN);
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid session cookie', async () => {
    const req = new Request('http://localhost/api/favourites', {
      method: 'GET',
      headers: { Cookie: 'session=bad-cookie' },
    });
    const res = await handleFavourites(req, db as any, SECRET, ORIGIN);
    expect(res.status).toBe(401);
  });

  it('returns 200 with empty article_ids for authenticated user', async () => {
    const cookie = await signSession('fav@example.com', SECRET);
    const req = new Request('http://localhost/api/favourites', {
      method: 'GET',
      headers: { Cookie: `session=${cookie}` },
    });
    const res = await handleFavourites(req, db as any, SECRET, ORIGIN);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.article_ids).toEqual([]);
  });
});

describe('POST /api/favourites', () => {
  let rawDb: InstanceType<typeof Database>;
  let db: ReturnType<typeof d1>;
  let cookie: string;

  beforeEach(async () => {
    rawDb = makeDb();
    db = d1(rawDb);
    rawDb.prepare('INSERT INTO subscribers (email) VALUES (?)').run('fav@example.com');
    cookie = await signSession('fav@example.com', SECRET);
  });

  it('returns 401 with no cookie', async () => {
    const req = new Request('http://localhost/api/favourites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_id: 'aihot-a3f12b8c' }),
    });
    const res = await handleFavourites(req, db as any, SECRET, ORIGIN);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid article_id format', async () => {
    const req = new Request('http://localhost/api/favourites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `session=${cookie}` },
      body: JSON.stringify({ article_id: 'INVALID ID WITH SPACES' }),
    });
    const res = await handleFavourites(req, db as any, SECRET, ORIGIN);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe('invalid_article_id');
  });

  it('returns 201 and inserts row for valid article_id', async () => {
    const req = new Request('http://localhost/api/favourites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `session=${cookie}` },
      body: JSON.stringify({ article_id: 'aihot-a3f12b8c' }),
    });
    const res = await handleFavourites(req, db as any, SECRET, ORIGIN);
    expect(res.status).toBe(201);
    const row = rawDb.prepare('SELECT article_id FROM favourites WHERE email = ?').get('fav@example.com') as any;
    expect(row?.article_id).toBe('aihot-a3f12b8c');
  });

  it('returns 200 for duplicate (idempotent)', async () => {
    const makeReq = () => new Request('http://localhost/api/favourites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `session=${cookie}` },
      body: JSON.stringify({ article_id: 'aihot-a3f12b8c' }),
    });
    await handleFavourites(makeReq(), db as any, SECRET, ORIGIN);
    const r2 = await handleFavourites(makeReq(), db as any, SECRET, ORIGIN);
    expect(r2.status).toBe(200);
  });
});

describe('DELETE /api/favourites/:article_id', () => {
  let rawDb: InstanceType<typeof Database>;
  let db: ReturnType<typeof d1>;
  let cookie: string;

  beforeEach(async () => {
    rawDb = makeDb();
    db = d1(rawDb);
    rawDb.prepare('INSERT INTO subscribers (email) VALUES (?)').run('fav@example.com');
    rawDb.prepare('INSERT INTO favourites (email, article_id) VALUES (?, ?)').run('fav@example.com', 'aihot-a3f12b8c');
    cookie = await signSession('fav@example.com', SECRET);
  });

  it('returns 200 and removes row', async () => {
    const req = new Request('http://localhost/api/favourites/aihot-a3f12b8c', {
      method: 'DELETE',
      headers: { Cookie: `session=${cookie}` },
    });
    const res = await handleFavourites(req, db as any, SECRET, ORIGIN);
    expect(res.status).toBe(200);
    const row = rawDb.prepare('SELECT article_id FROM favourites WHERE email = ? AND article_id = ?').get('fav@example.com', 'aihot-a3f12b8c');
    expect(row).toBeUndefined();
  });

  it('returns 200 for non-existent article_id (idempotent)', async () => {
    const req = new Request('http://localhost/api/favourites/aihot-99999999', {
      method: 'DELETE',
      headers: { Cookie: `session=${cookie}` },
    });
    const res = await handleFavourites(req, db as any, SECRET, ORIGIN);
    expect(res.status).toBe(200);
  });
});
