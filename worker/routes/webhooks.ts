/**
 * POST /api/webhooks/beehiiv
 * Verifies Beehiiv HMAC-SHA256 signature (header: X-Beehiiv-Signature).
 * Handles subscriber.unsubscribed event → sets unsubscribed_at in D1.
 * When BEEHIIV_WEBHOOK_SECRET is absent, skips verification (local/test safety).
 */
import { setUnsubscribed } from '../lib/db';
import type { ApiError } from '../types';

function jsonErr(status: number, error: string, message: string): Response {
  return new Response(JSON.stringify({ error, message } satisfies ApiError), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));

    // Decode the caller-supplied hex signature into bytes for constant-time comparison.
    // hex.length must equal sigBytes.byteLength * 2; reject immediately if not.
    const expectedBytes = new Uint8Array(sigBytes);
    if (signature.length !== expectedBytes.length * 2) return false;
    const actualBytes = Uint8Array.from(
      (signature.match(/../g) ?? []).map(h => parseInt(h, 16)),
    );
    if (actualBytes.length !== expectedBytes.length) return false;

    // Constant-time comparison via SubtleCrypto verify — the platform provides
    // timing-safe comparison as part of HMAC verify, which avoids early-exit
    // string comparison that enables timing-oracle attacks.
    const verifyKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify('HMAC', verifyKey, actualBytes, new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

export async function handleWebhook(
  request: Request,
  db: D1Database,
  webhookSecret?: string,
): Promise<Response> {
  const rawBody = await request.text();

  // Verify HMAC signature when secret is configured
  if (webhookSecret) {
    const signature = request.headers.get('X-Beehiiv-Signature') ?? '';
    if (!signature) {
      return jsonErr(401, 'missing_signature', 'X-Beehiiv-Signature header required');
    }
    const valid = await verifySignature(rawBody, signature, webhookSecret);
    if (!valid) {
      return jsonErr(401, 'invalid_signature', 'Signature verification failed');
    }
  }

  let event: { type: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return jsonErr(400, 'bad_request', 'Request body must be valid JSON');
  }

  // Handle known event types
  if (event.type === 'subscriber.unsubscribed') {
    const email = typeof event.data?.email === 'string' ? event.data.email : null;
    if (email) {
      await setUnsubscribed(db, email);
    }
  }
  // Unknown event types are accepted (no-op) — forward-compatibility

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
