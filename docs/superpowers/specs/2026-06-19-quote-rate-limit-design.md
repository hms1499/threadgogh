# Quote-branch rate limiting

**Date:** 2026-06-19
**Status:** approved

## Problem

`POST /api/generate` Branch 1 (no `invoiceId`) is unauthenticated and, per request,
calls `generateHook` (a real LLM cost) **and** inserts an invoice row. Nothing limits
how often it can be hit, so a bot can run up the LLM bill and spam the `invoices`
table at zero cost to the attacker. This is the largest pre-mainnet operational risk.

Branch 2 (with `invoiceId`) is already gated by an on-chain payment and is out of scope.

## Approach

Fixed-window rate limit per client IP, stored in Supabase (reuses existing infra — no
new managed service, dependency, or boot-validated env). Chosen over Upstash Redis
(extra service + env to provision) and in-memory (unreliable across serverless
instances).

## Design

### Identity
`clientIp(req)`: first hop of `x-forwarded-for`, else `x-real-ip`, else sentinel
`"unknown"`. Requests missing an IP share one limited bucket (never bypass). Dev/local
requests fall into `"unknown"` — acceptable.

### Storage + algorithm
One row per IP, fixed window, atomic in Postgres.

```
rate_limits(
  key          text primary key,
  count        int         not null,
  window_start timestamptz not null
)
```

RPC `check_rate_limit(p_key text, p_max int, p_window_secs int)`:
`INSERT ... ON CONFLICT (key) DO UPDATE` — if the stored window has elapsed, reset
`count = 1, window_start = now()`; otherwise `count = count + 1`. Returns
`{ allowed boolean, retry_after_sec int }`. Single statement → atomic, race-free. The
"window elapsed" test lives in one `stable` helper, `rl_window_expired(window_start,
window_secs)`, called by both reset branches so they cannot drift.

Expiry is derived (`window_start + window`), not stored. Table stays small (one row per
active IP). Dead-row cleanup is optional pg_cron on `window_start` age, documented in the
migration; not required for correctness.

### Policy
Default **10 quotes / 60s / IP**. Configurable via `RATE_LIMIT_QUOTE_MAX` (10) and
`RATE_LIMIT_QUOTE_WINDOW_SEC` (60), resolved in `lib/config.ts`. Both have defaults, so
they are **not** added to boot validation.

### Failure mode
RPC error → log a warning and **fail open** (allow). The very next step
(`createInvoice`) also needs Supabase, so a real outage fails the request there anyway;
a limiter blip must not block legitimate users.

### Response
On limit exceeded: `429` with body `{ error, retryAfterSec }` and a `Retry-After`
header. Enforced at the **top of Branch 1**, before `generateHook` and `createInvoice`.

## Units

- `lib/rate-limit.ts` — `clientIp(req)` (pure) + `checkRateLimit(key, {max, windowSec})`
  (wraps `supabase.rpc`, maps result, fails open on error).
- `supabase/migrations/<ts>_rate_limit.sql` — table + function.
- `lib/config.ts` — `RATE_LIMIT_QUOTE_MAX`, `RATE_LIMIT_QUOTE_WINDOW_SEC`.
- `app/api/generate/route.ts` — wire into Branch 1.
- `.env.example` — document the two vars.

## Testing (TDD)

- `clientIp`: parses `x-forwarded-for` first hop, falls back to `x-real-ip`, then
  `"unknown"`.
- `checkRateLimit`: maps RPC `{allowed, retry_after_sec}`; fails open (allowed=true) on
  RPC error.
- `generate` route: over limit → `429`, `generateHook` and `createInvoice` NOT called;
  within limit → normal `402` quote.

## Out of scope

- Rate-limiting Branch 2 (payment-gated already).
- Distributed/sliding-window precision; fixed-window is sufficient for cost control.
- Automated dead-row cleanup (optional pg_cron, documented only).
