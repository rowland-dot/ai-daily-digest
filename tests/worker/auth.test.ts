import { describe, it, expect } from 'vitest';
import { signSession, verifySession, generateToken } from '../../worker/lib/auth';

const SECRET = 'test-secret-32-bytes-xxxxxxxxxxxxxxxxx';

describe('signSession / verifySession', () => {
  it('round-trips an email', async () => {
    const cookie = await signSession('user@example.com', SECRET);
    const email = await verifySession(cookie, SECRET);
    expect(email).toBe('user@example.com');
  });

  it('returns null for tampered cookie', async () => {
    const cookie = (await signSession('user@example.com', SECRET)) + 'tampered';
    expect(await verifySession(cookie, SECRET)).toBeNull();
  });

  it('returns null for expired cookie', async () => {
    const cookie = await signSession('user@example.com', SECRET, -1); // expired 1 day ago
    expect(await verifySession(cookie, SECRET)).toBeNull();
  });

  it('returns null for wrong secret', async () => {
    const cookie = await signSession('user@example.com', SECRET);
    expect(await verifySession(cookie, 'wrong-secret')).toBeNull();
  });

  it('returns null for empty string', async () => {
    expect(await verifySession('', SECRET)).toBeNull();
  });

  it('returns null for malformed base64', async () => {
    expect(await verifySession('not-base64!!!', SECRET)).toBeNull();
  });
});

describe('generateToken', () => {
  it('returns a 64-char hex string', () => {
    const t = generateToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique tokens', () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});
