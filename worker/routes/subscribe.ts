/**
 * POST /api/subscribe
 * Body: { email: string, language?: 'en' | 'zh' }
 * Upserts subscriber (pending), inserts magic_link, sends email via Resend stub.
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

export async function handleSubscribe(
  request: Request,
  db: D1Database,
  sendEmail: EmailSender,
  siteOrigin = 'https://ai-daily-digest.com',
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, 'bad_request', 'Request body must be valid JSON');
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const language = body.language === 'zh' ? 'zh' : 'en';

  if (!email) {
    return jsonErr(400, 'missing_email', 'email is required');
  }
  if (!EMAIL_RE.test(email)) {
    return jsonErr(400, 'invalid_email', 'email must be a valid email address');
  }

  // Upsert subscriber (preserve verified_at on re-subscribe)
  await upsertSubscriber(db, email, language);

  // Generate magic-link token (30-minute expiry)
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await insertMagicLink(db, token, email, 'subscribe', expiresAt);

  // Send email (no-ops if RESEND_API_KEY absent)
  const verifyUrl = `${siteOrigin}/api/auth/verify?token=${token}`;
  const html = `<p>Click <a href="${verifyUrl}">here</a> to confirm your subscription to AI Daily Digest.</p>`;
  await sendEmail(email, 'Confirm your AI Daily Digest subscription', html);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
