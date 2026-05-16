/**
 * Account management routes:
 *   POST /api/account/unsubscribe  — set unsubscribed_at
 *   PUT  /api/account/language     — update language preference
 *   POST /api/account/delete       — GDPR delete all data, clear cookie
 */
import { verifySession } from '../lib/auth';
import { setUnsubscribed, updateLanguage, deleteAllForEmail } from '../lib/db';
import { unsubscribeFromBeehiiv, moveToLanguageSegment } from '../lib/beehiiv';
import type { ApiError } from '../types';

function jsonErr(status: number, error: string, message: string): Response {
  return new Response(JSON.stringify({ error, message } satisfies ApiError), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie') ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}

const VALID_LANGUAGES = new Set(['en', 'zh']);

export async function handleAccount(
  request: Request,
  db: D1Database,
  secret: string,
  beehiivApiKey: string,
  beehiivPubId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const { method } = request;

  // Auth check for all account routes
  const sessionCookie = getSessionCookie(request);
  const email = sessionCookie ? await verifySession(sessionCookie, secret) : null;
  if (!email) {
    return jsonErr(401, 'unauthorized', 'Valid session cookie required');
  }

  const headers: HeadersInit = { 'Content-Type': 'application/json' };

  // POST /api/account/unsubscribe
  if (method === 'POST' && pathname === '/api/account/unsubscribe') {
    await setUnsubscribed(db, email);
    await unsubscribeFromBeehiiv(email, beehiivApiKey, beehiivPubId);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  // PUT /api/account/language
  if (method === 'PUT' && pathname === '/api/account/language') {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonErr(400, 'bad_request', 'Request body must be valid JSON');
    }

    const language = typeof body.language === 'string' ? body.language : '';
    if (!VALID_LANGUAGES.has(language)) {
      return jsonErr(400, 'invalid_language', 'language must be "en" or "zh"');
    }

    await updateLanguage(db, email, language);
    await moveToLanguageSegment(email, language, beehiivApiKey, beehiivPubId);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  // POST /api/account/delete — GDPR delete
  if (method === 'POST' && pathname === '/api/account/delete') {
    await deleteAllForEmail(db, email);
    await unsubscribeFromBeehiiv(email, beehiivApiKey, beehiivPubId);
    // Clear session cookie
    const clearCookie = 'session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/';
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...headers, 'Set-Cookie': clearCookie },
    });
  }

  return new Response('Not implemented', { status: 501 });
}
