-- AI Daily Digest — D1 Initial Schema
-- Tables: subscribers, favourites, magic_links

CREATE TABLE IF NOT EXISTS subscribers (
  email           TEXT PRIMARY KEY NOT NULL,
  language        TEXT NOT NULL DEFAULT 'en',
  verified_at     TEXT,
  unsubscribed_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subscribers_verified
  ON subscribers (verified_at);

CREATE TABLE IF NOT EXISTS favourites (
  email       TEXT NOT NULL,
  article_id  TEXT NOT NULL,
  saved_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, article_id)
);

CREATE INDEX IF NOT EXISTS idx_favourites_email
  ON favourites (email);

CREATE TABLE IF NOT EXISTS magic_links (
  token       TEXT PRIMARY KEY NOT NULL,
  email       TEXT NOT NULL,
  purpose     TEXT NOT NULL,       -- 'subscribe' | 'restore-favourites'
  expires_at  TEXT NOT NULL,
  consumed_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_magic_links_email
  ON magic_links (email);

CREATE INDEX IF NOT EXISTS idx_magic_links_expires
  ON magic_links (expires_at);
