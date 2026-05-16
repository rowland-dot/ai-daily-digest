/**
 * HMAC session cookie sign/verify and magic-link token generation.
 * Uses Web Crypto API (available in Node 18+ and Cloudflare Workers).
 */

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function signSession(
  email: string,
  secret: string,
  expiresInDays = 30,
): Promise<string> {
  const expiresAt = new Date(Date.now() + expiresInDays * 86400 * 1000).toISOString();
  const payload = `${email}|${expiresAt}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sigHex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return btoa(`${payload}|${sigHex}`);
}

export async function verifySession(
  cookie: string,
  secret: string,
): Promise<string | null> {
  try {
    if (!cookie) return null;
    const decoded = atob(cookie);
    const parts = decoded.split('|');
    if (parts.length !== 3) return null;
    const [email, expiresAt, sigHex] = parts;
    if (new Date(expiresAt) < new Date()) return null;
    const payload = `${email}|${expiresAt}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const sigBytes = Uint8Array.from(
      (sigHex.match(/../g) ?? []).map(h => parseInt(h, 16)),
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(payload),
    );
    return valid ? email : null;
  } catch {
    return null;
  }
}
