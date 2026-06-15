import { createHmac, timingSafeEqual } from 'crypto';

// Server-only. A stateless, HMAC-signed session that lets a wallet sign in once and
// then page through history without re-signing. The cookie holds {address, exp};
// the signature proves the server minted it. No DB — see the auth-hardening spec.

export const SESSION_COOKIE = 'tg_session';
export const SESSION_TTL_MS = 60 * 60_000; // 60 minutes

type Payload = { address: string; exp: number };

function secret(): string {
  const s = process.env.AUTH_SESSION_SECRET;
  if (!s) throw new Error('AUTH_SESSION_SECRET is missing');
  return s;
}

function sign(payloadB64: string): string {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

export function createSessionToken(address: string, now = Date.now()): string {
  const payloadB64 = Buffer.from(JSON.stringify({ address, exp: now + SESSION_TTL_MS })).toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifySessionToken(token: string | undefined | null, now = Date.now()): { address: string } | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;

  const payloadB64 = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(payloadB64);

  const got = Buffer.from(mac);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;

  let payload: Partial<Payload>;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.address !== 'string' || typeof payload.exp !== 'number') return null;
  if (now >= payload.exp) return null;
  return { address: payload.address };
}

// Cookie attributes for the session. Secure only in production so it still works on
// http://localhost during dev.
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}
