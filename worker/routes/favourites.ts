/**
 * GET|POST|DELETE /api/favourites
 * All routes require a valid HMAC session cookie.
 * POST validates article_id format before insert (E-S1 security finding).
 */
import { verifySession } from '../lib/auth';
import { getFavourites, addFavourite, removeFavourite, isValidArticleId } from '../lib/db';
import type { ApiError } from '../types';

function jsonErr(status: number, error: string, message: string): Response {
  return new Response(JSON.stringify({ error, message } satisfies ApiError), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function corsHeaders(siteOrigin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': siteOrigin,
    'Access-Control-Allow-Credentials': 'true',
  };
}

function getSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie') ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}

export async function handleFavourites(
  request: Request,
  db: D1Database,
  secret: string,
  siteOrigin: string,
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const { method } = request;

  // Auth check
  const sessionCookie = getSessionCookie(request);
  const email = sessionCookie ? await verifySession(sessionCookie, secret) : null;
  if (!email) {
    return jsonErr(401, 'unauthorized', 'Valid session cookie required');
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...corsHeaders(siteOrigin),
  };

  // GET /api/favourites
  if (method === 'GET' && pathname === '/api/favourites') {
    const articleIds = await getFavourites(db, email);
    return new Response(JSON.stringify({ article_ids: articleIds }), { status: 200, headers });
  }

  // POST /api/favourites
  if (method === 'POST' && pathname === '/api/favourites') {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonErr(400, 'bad_request', 'Request body must be valid JSON');
    }

    const articleId = typeof body.article_id === 'string' ? body.article_id.trim() : '';
    if (!articleId) {
      return jsonErr(400, 'missing_article_id', 'article_id is required');
    }
    // E-S1: validate article_id shape before insert
    if (!isValidArticleId(articleId)) {
      return jsonErr(400, 'invalid_article_id', 'article_id must match pattern <source>-<8-hex-chars>');
    }

    // Check if already exists (idempotent)
    const existing = await getFavourites(db, email);
    if (existing.includes(articleId)) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    await addFavourite(db, email, articleId);
    return new Response(JSON.stringify({ ok: true }), { status: 201, headers });
  }

  // DELETE /api/favourites/:article_id
  const deleteMatch = pathname.match(/^\/api\/favourites\/([^/]+)$/);
  if (method === 'DELETE' && deleteMatch) {
    const articleId = deleteMatch[1];
    await removeFavourite(db, email, articleId); // idempotent — no error if missing
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  return new Response('Not implemented', { status: 501 });
}
