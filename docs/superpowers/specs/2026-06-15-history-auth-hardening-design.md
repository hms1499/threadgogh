# History auth hardening — session cookie + domain/network binding

Date: 2026-06-15
Scope: recommendations #2 (session token, stop re-signing) and #3 (SIWE
hardening) for the thread history sign-in. Chosen variant: **lean / stateless** —
no nonce table, no challenge endpoint. Builds on the pagination work already on main.

## Goals

- A wallet signs in **once**; paging and remounts reuse a server session instead of
  re-prompting the wallet (#2).
- The signed message is **bound to the app domain and the Stacks network** so a
  signature can't be replayed against a phishing clone or the wrong network (#3).

Out of scope (accepted): same-domain replay of a captured signature within the
5-minute window. History is read-only and low-severity; true single-use nonce was
explicitly declined to avoid a nonce table + challenge round-trip.

## New configuration

- `AUTH_SESSION_SECRET` — server-only, ≥32 bytes. HMAC key for the session cookie.
  Required in `lib/env.ts` (fail-fast) and documented in `.env.example`.
- `NEXT_PUBLIC_APP_DOMAIN` — isomorphic (client + server build the same message).
  Default `threadgogh.vercel.app`; set to `localhost` in `.env.local` for dev.
  Added to `lib/config.ts`.

## Signed message (`lib/auth-message.ts`)

`buildHistoryMessage` gains `domain` and `network` parameters:

```
ThreadGogh — sign in to view your thread history.

Address: <addr>
Domain: <domain>
Network: <testnet|mainnet>
Issued: <iso>

This is a free signature — it does not move funds or create a transaction.
```

Callers pass `APP_DOMAIN` and `STACKS_NETWORK` from `config.ts` (both isomorphic, so
client and server produce byte-identical messages). `verifyHistoryAuth` reconstructs
the message with the server's own domain + network, so a signature for another
domain/network fails the existing template-match check — no new branch needed.

## Session token (`lib/session.ts`, new, server-only)

- `createSessionToken(address): string` → `base64url(payload).base64url(hmac)` where
  payload is `{ address, exp }`, TTL 60 minutes, HMAC-SHA256 over the payload with
  `AUTH_SESSION_SECRET`.
- `verifySessionToken(token): { address: string } | null` → null on bad HMAC,
  malformed token, or expiry. Constant-time HMAC compare.
- Pure functions taking the secret via a small accessor, so they unit-test without a
  live cookie. Cookie attributes: name `tg_session`, HttpOnly, Secure in production,
  SameSite=Strict, Path=/, Max-Age=3600.

## Route flow (`/api/history`)

1. Read `tg_session`. If `verifySessionToken` returns an address → use it, skip the
   signature path → `fetchHistoryPage(address, cursor)`.
2. Otherwise require `{ address, message, signature }`. On `verifyHistoryAuth` success,
   set a fresh `tg_session` cookie for `address`, then `fetchHistoryPage`.
3. No cookie and no signature → 401.

Paging requests therefore send only `{ cursor }`; the browser attaches the cookie
automatically. Read cookies via `req.cookies` and set via the `NextResponse` cookies
API — confirm the exact API against `node_modules/next/dist/docs/` before coding
(this Next.js is modified; see frontend/AGENTS.md).

## Client (`HistoryPanel.tsx`)

Simplify: first load signs and the server sets the cookie; later loads (load-more,
remount within 60 min) send only the cursor and rely on the cookie. Drop the manual
5-minute `cred` caching — the cookie supersedes it. A 401 clears local state and falls
back to the "Sign in" button so the user re-signs.

## Testing

- `lib/session` unit tests: round-trip, tampered payload, tampered signature, expiry.
- `lib/auth` tests updated for the new domain/network lines (valid + wrong-domain +
  wrong-network rejection).
- Route tests: valid cookie → no signature required; no cookie + valid signature →
  200 and Set-Cookie present; no cookie + no signature → 401; expired cookie falls
  through to the signature path.

## Tasks / commits

1. `feat(auth): HMAC session token util (lib/session)` — + tests.
2. `feat(auth): bind sign-in message to domain + network` — auth-message/auth/config + tests.
3. `feat(api): session cookie for history route` — cookie-first auth, Set-Cookie + tests.
4. `feat(ui): rely on session cookie for history paging`.
5. `docs(env): document AUTH_SESSION_SECRET + NEXT_PUBLIC_APP_DOMAIN`.

TDD per change: failing test first, then implement.
