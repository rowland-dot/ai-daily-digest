/**
 * GET /api/auth/verify?token=<token>
 * Validates a magic-link token, marks it consumed, sets verified_at on subscriber,
 * issues an HMAC session cookie, and redirects by purpose.
 */
import { signSession } from '../lib/auth';
import { getMagicLink, consumeMagicLink, setVerified } from '../lib/db';
import type { ApiError } from '../types';

function jsonErr(status: number, error: string, message: string): Response {
  return new Response(JSON.stringify({ error, message } satisfies ApiError), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleAuthVerify(
  request: Request,
  db: D1Database,
  secret: string,
  siteOrigin: string,
): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return jsonErr(400, 'missing_token', 'token query parameter is required');
  }

  const link = await getMagicLink(db, token);
  if (!link) {
    return jsonErr(404, 'token_not_found', 'Magic link not found or already expired');
  }

  if (link.consumed_at) {
    return jsonErr(400, 'token_consumed', 'This magic link has already been used');
  }

  if (new Date(link.expires_at) < new Date()) {
    return jsonErr(400, 'token_expired', 'This magic link has expired');
  }

  // Consume the token and verify the subscriber
  await consumeMagicLink(db, token);
  await setVerified(db, link.email);

  // Issue HMAC session cookie (30 days)
  const sessionCookie = await signSession(link.email, secret, 30);
  const cookieHeader = `session=${sessionCookie}; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}; Path=/`;

  // Redirect based on purpose
  const redirectPath =
    link.purpose === 'restore-favourites'
      ? '/favourites?welcome=1'
      : '/account?welcome=1';

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${siteOrigin}${redirectPath}`,
      'Set-Cookie': cookieHeader,
    },
  });
}
