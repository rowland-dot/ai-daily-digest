/**
 * D1 query helpers — thin wrappers so route handlers stay readable.
 * All functions accept a D1Database (or compatible shim in tests).
 */

export interface Subscriber {
  email: string;
  language: string;
  verified_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
}

export interface MagicLink {
  token: string;
  email: string;
  purpose: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

export interface Favourite {
  email: string;
  article_id: string;
  saved_at: string;
}

/**
 * Insert a new pending subscriber (unauthenticated / public routes).
 *
 * On conflict: does NOT update language — preserves the existing subscriber's
 * language preference. This prevents unauthenticated callers (/api/subscribe,
 * /api/sync-favourites) from mutating a verified subscriber's preferences.
 *
 * Use `updateLanguage()` (authenticated route only) to change language for
 * an existing subscriber.
 */
export async function upsertSubscriber(
  db: D1Database,
  email: string,
  language = 'en',
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO subscribers (email, language)
       VALUES (?, ?)
       ON CONFLICT(email) DO NOTHING`,
    )
    .bind(email, language)
    .run();
}

export async function getSubscriber(
  db: D1Database,
  email: string,
): Promise<Subscriber | null> {
  return (await db
    .prepare('SELECT * FROM subscribers WHERE email = ?')
    .bind(email)
    .first()) as Subscriber | null;
}

export async function setVerified(db: D1Database, email: string): Promise<void> {
  await db
    .prepare("UPDATE subscribers SET verified_at = datetime('now') WHERE email = ?")
    .bind(email)
    .run();
}

export async function setUnsubscribed(db: D1Database, email: string): Promise<void> {
  await db
    .prepare("UPDATE subscribers SET unsubscribed_at = datetime('now') WHERE email = ?")
    .bind(email)
    .run();
}

export async function updateLanguage(
  db: D1Database,
  email: string,
  language: string,
): Promise<void> {
  await db
    .prepare('UPDATE subscribers SET language = ? WHERE email = ?')
    .bind(language, email)
    .run();
}

export async function deleteAllForEmail(db: D1Database, email: string): Promise<void> {
  await db.prepare('DELETE FROM favourites WHERE email = ?').bind(email).run();
  await db.prepare('DELETE FROM magic_links WHERE email = ?').bind(email).run();
  await db.prepare('DELETE FROM subscribers WHERE email = ?').bind(email).run();
}

export async function insertMagicLink(
  db: D1Database,
  token: string,
  email: string,
  purpose: string,
  expiresAt: string,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO magic_links (token, email, purpose, expires_at) VALUES (?, ?, ?, ?)',
    )
    .bind(token, email, purpose, expiresAt)
    .run();
}

export async function getMagicLink(
  db: D1Database,
  token: string,
): Promise<MagicLink | null> {
  return (await db
    .prepare('SELECT * FROM magic_links WHERE token = ?')
    .bind(token)
    .first()) as MagicLink | null;
}

export async function consumeMagicLink(db: D1Database, token: string): Promise<void> {
  await db
    .prepare("UPDATE magic_links SET consumed_at = datetime('now') WHERE token = ?")
    .bind(token)
    .run();
}

// ---------- Favourites ----------

const ARTICLE_ID_RE = /^[a-z][a-z0-9]+-[0-9a-f]{8}$/;

export function isValidArticleId(id: string): boolean {
  return ARTICLE_ID_RE.test(id);
}

export async function getFavourites(
  db: D1Database,
  email: string,
): Promise<string[]> {
  const result = await db
    .prepare('SELECT article_id FROM favourites WHERE email = ? ORDER BY saved_at DESC')
    .bind(email)
    .all();
  return (result.results as Favourite[]).map(r => r.article_id);
}

export async function addFavourite(
  db: D1Database,
  email: string,
  articleId: string,
): Promise<void> {
  await db
    .prepare(
      'INSERT OR IGNORE INTO favourites (email, article_id) VALUES (?, ?)',
    )
    .bind(email, articleId)
    .run();
}

export async function removeFavourite(
  db: D1Database,
  email: string,
  articleId: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM favourites WHERE email = ? AND article_id = ?')
    .bind(email, articleId)
    .run();
}
