import { verifyHistoryAuth } from './auth';
import {
  SESSION_COOKIE, verifySessionToken, createSessionToken, sessionCookieOptions,
} from './session';

// Shared request-level auth for /api/history and /api/regenerate so both gate on
// identical rules: a fresh sign-in signature (which then mints a session cookie) OR an
// existing session cookie. Composes the leaf primitives in auth.ts + session.ts.

type ReqLike = { cookies: { get(name: string): { value: string } | undefined } };
type ResLike = {
  cookies: { set(name: string, value: string, opts: ReturnType<typeof sessionCookieOptions>): void };
};
type AuthBody = { address?: string; message?: string; signature?: string };

export type AddressAuth =
  | { ok: true; address: string; mintCookie: boolean }
  | { ok: false; reason: string };

// Resolve the caller to a Stacks address. A fresh signature always wins over an existing
// cookie, so switching wallets re-binds the session instead of using the old address.
export function authenticateAddress(req: ReqLike, body: AuthBody): AddressAuth {
  if (body?.message && body?.signature) {
    const auth = verifyHistoryAuth({
      address: body.address ?? '', message: body.message, signature: body.signature,
    });
    if (!auth.ok) return { ok: false, reason: auth.reason };
    return { ok: true, address: body.address as string, mintCookie: true };
  }
  const session = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return { ok: false, reason: 'sign in required' };
  return { ok: true, address: session.address, mintCookie: false };
}

// Mint/refresh the session cookie on the response after a fresh-signature sign-in, so
// later requests within the cookie's lifetime don't re-prompt the wallet.
export function applySessionCookie(res: ResLike, address: string): void {
  res.cookies.set(SESSION_COOKIE, createSessionToken(address), sessionCookieOptions());
}
