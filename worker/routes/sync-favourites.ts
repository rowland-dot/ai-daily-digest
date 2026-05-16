/**
 * POST /api/sync-favourites
 * Body: { email: string }
 * Upserts subscriber, issues a restore-favourites magic link, sends email.
 * After verify, redirects to /favourites?welcome=1.
 */
import { generateToken } from '../lib/auth';
import { upsertSubscriber, insertMagicLink } from '../lib/db';
import type { EmailSender } from '../lib/email';
import type { ApiError } from '../types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonErr(status: number, error: string, message: string): Response {
  return new Response(JSON.stringify({ error, message } satisfies ApiError), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleSyncFavourites(
  request: Request,
  db: D1Database,
  sendEmail: EmailSender,
  siteOrigin: string,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, 'bad_request', 'Request body must be valid JSON');
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email) {
    return jsonErr(400, 'missing_email', 'email is required');
  }
  if (!EMAIL_RE.test(email)) {
    return jsonErr(400, 'invalid_email', 'email must be a valid email address');
  }

  // Upsert subscriber (default language en; preserves existing prefs)
  await upsertSubscriber(db, email, 'en');

  // Generate restore-favourites magic link (30-minute expiry)
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await insertMagicLink(db, token, email, 'restore-favourites', expiresAt);

  // Send email
  const verifyUrl = `${siteOrigin}/api/auth/verify?token=${token}`;
  const html = `<p>Click <a href="${verifyUrl}">here</a> to sync your AI Daily Digest favourites to this device.</p>`;
  await sendEmail(email, 'Sync your AI Daily Digest favourites', html);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
