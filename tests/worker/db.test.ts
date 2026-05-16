/**
 * D1 schema tests — uses better-sqlite3 as a local SQLite stand-in for D1.
 * The schema file is the source of truth; these tests verify it is valid SQL
 * and that the table structure matches spec Data model section expectations.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';

let db: InstanceType<typeof Database>;

beforeAll(() => {
  db = new Database(':memory:');
  const sql = readFileSync('./migrations/0001_initial_schema.sql', 'utf8');
  db.exec(sql);
});

afterAll(() => {
  db.close();
});

describe('D1 schema — subscribers', () => {
  it('can insert and retrieve a subscriber with default language en', () => {
    db.prepare('INSERT INTO subscribers (email) VALUES (?)').run('test@example.com');
    const row = db.prepare('SELECT email, language FROM subscribers WHERE email = ?').get('test@example.com') as any;
    expect(row?.email).toBe('test@example.com');
    expect(row?.language).toBe('en');
  });

  it('verified_at defaults to NULL', () => {
    const row = db.prepare('SELECT verified_at FROM subscribers WHERE email = ?').get('test@example.com') as any;
    expect(row?.verified_at).toBeNull();
  });

  it('unsubscribed_at defaults to NULL', () => {
    const row = db.prepare('SELECT unsubscribed_at FROM subscribers WHERE email = ?').get('test@example.com') as any;
    expect(row?.unsubscribed_at).toBeNull();
  });

  it('email is the primary key (duplicate insert throws)', () => {
    expect(() =>
      db.prepare('INSERT INTO subscribers (email) VALUES (?)').run('test@example.com')
    ).toThrow();
  });
});

describe('D1 schema — favourites', () => {
  it('can insert favourites linked to subscriber email', () => {
    db.prepare('INSERT INTO favourites (email, article_id) VALUES (?, ?)').run('test@example.com', 'aihot-a3f12b8c');
    const row = db.prepare('SELECT article_id FROM favourites WHERE email = ?').get('test@example.com') as any;
    expect(row?.article_id).toBe('aihot-a3f12b8c');
  });

  it('(email, article_id) pair is unique (duplicate insert throws)', () => {
    expect(() =>
      db.prepare('INSERT INTO favourites (email, article_id) VALUES (?, ?)').run('test@example.com', 'aihot-a3f12b8c')
    ).toThrow();
  });

  it('saved_at has a default timestamp', () => {
    const row = db.prepare('SELECT saved_at FROM favourites WHERE email = ? AND article_id = ?').get('test@example.com', 'aihot-a3f12b8c') as any;
    expect(row?.saved_at).toBeTruthy();
  });
});

describe('D1 schema — magic_links', () => {
  it('can insert and retrieve a magic link', () => {
    db.prepare(
      'INSERT INTO magic_links (token, email, purpose, expires_at) VALUES (?, ?, ?, ?)'
    ).run('abc123', 'test@example.com', 'subscribe', new Date(Date.now() + 1800000).toISOString());

    const row = db.prepare('SELECT purpose FROM magic_links WHERE token = ?').get('abc123') as any;
    expect(row?.purpose).toBe('subscribe');
  });

  it('consumed_at defaults to NULL', () => {
    const row = db.prepare('SELECT consumed_at FROM magic_links WHERE token = ?').get('abc123') as any;
    expect(row?.consumed_at).toBeNull();
  });

  it('token is the primary key (duplicate insert throws)', () => {
    expect(() =>
      db.prepare(
        'INSERT INTO magic_links (token, email, purpose, expires_at) VALUES (?, ?, ?, ?)'
      ).run('abc123', 'test@example.com', 'subscribe', new Date().toISOString())
    ).toThrow();
  });
});
