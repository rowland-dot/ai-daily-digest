/**
 * GET /api/auth/verify?token=<token>
 * Validates a magic-link token, marks it consumed, sets verified_at on subscriber,
 * issues an HMAC session cookie, and redirects by purpose.
 *
 * Security note: all token validation failures return the same opaque error
 * code (invalid_or_expired / 400) regardless of whether the token was not
 * found, consumed, or expired. Distinct codes would let an attacker enumerate
 * token state via the error response.
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

/** Opaque error for any token validation failure — avoids leaking token state. */
function tokenInvalid(): Response {
  return jsonErr(400, 'invalid_or_expired', 'Magic link is invalid or has expired');
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
  // not_found, consumed, and expired all collapse to the same opaque error
  // to prevent timing-oracle enumeration of token existence / state.
  if (!link) {
    return tokenInvalid();
  }

  if (link.consumed_at) {
    // Server-side log retains granularity for debugging; response does not.
    console.error(`auth-verify: token consumed attempt — email=${link.email}`);
    return tokenInvalid();
  }

  if (new Date(link.expires_at) < new Date()) {
    console.error(`auth-verify: expired token attempt — email=${link.email}`);
    return tokenInvalid();
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
