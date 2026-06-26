# Backlink Instrumentation — Design

**Date:** 2026-06-26
**Status:** Approved, ready for implementation plan

## Problem

We just shipped the backlink credit feature (a viral loop: every thread copied/posted
to X carries a "Made with ThreadGogh" link). The team chose to ship as-is and *measure
before* building the deferred fast-follow (auto-minting a slug at post time so the
dominant path deep-links instead of pointing at the homepage). But there is currently
**no measurement infrastructure at all** — no analytics package, no way to know whether
backlinks get clicked, or whether the deep-link variant (`/t/<slug>`) outperforms the
homepage variant (`/`). "Measure first" is impossible without this.

## Goal

Answer one question with data: **do backlinks drive return traffic, and does the
deep-link variant pull more than the homepage variant?** This is the signal that
unblocks the deferred deep-link fast-follow decision. Scope is deliberately limited to
**landing clicks per variant** (Q1) — not full click→quote→paid conversion attribution,
and not general homepage top-of-funnel (both explicitly deferred).

## Decisions (settled during brainstorming)

- **Consumption (option A):** SQL in Supabase. A new append-only `events` table read with
  SQL, matching the existing operator workflow and the dependency-free, server-side ethos
  of the repo (no analytics package, no client cookies).
- **Scope (option A):** Q1 only — landing clicks per variant. No conversion attribution
  through the quote flow; no general homepage-visit counting (bot/dedup problem deferred).
- **Depth (option A):** count landing events only. Variant is derived from the landing
  path: `/t/<slug>` → `thread`, anything else → `home`.
- **Marker chokepoint:** the `?ref=tg` marker is injected inside `creditTweet`, so every
  credit tweet URL carries it regardless of which source URL it was built from. This is
  load-bearing: the main page's shared deep-link is built from `shareUrl` (not
  `creditUrl`), so injecting the marker only in `creditUrl` would silently drop tracking
  for that path. Single chokepoint = consistent coverage.

## Architecture & Data Flow

Server-side beacon. No client analytics library, no cookies.

```
backlink URL carries ?ref=tg  (injected inside creditTweet)
   │  reader clicks it on X
   ▼
lands on  /  or  /t/<slug>
   │  <BacklinkTracker> (client island in root layout) reads window.location;
   │  if ?ref present → variant = backlinkVariant(pathname)
   │      '/t/...' → 'thread'   ;   else → 'home'
   ▼  navigator.sendBeacon('/api/track', {event:'backlink_land', variant})
POST /api/track → validate allowlist → light per-IP rate limit → recordEvent()
   ▼  service-role insert
events(event, variant, created_at)
   ▼
SQL: select variant, count(*) from events where event='backlink_land' group by variant;
```

## Components & Changes

### `lib/postToX.ts` (modify)

- Add pure helper `withRef(url: string): string` — appends `ref=tg`, choosing `?` or `&`
  based on whether `url` already contains `?`. Pure, no DOM.
- `creditTweet(url)` embeds `withRef(url)` instead of the raw `url`. Every credit tweet
  now points at a `?ref=tg`-tagged URL.
- Update the existing `creditTweet` test to assert the embedded URL contains `?ref=tg`.
  `creditUrl` itself is unchanged (still returns a clean base/deep-link URL).

### `lib/track.ts` (new, pure)

- `export type BacklinkVariant = 'home' | 'thread';`
- `backlinkVariant(pathname: string): BacklinkVariant` — returns `'thread'` when
  `pathname` starts with `/t/`, else `'home'`. Pure, unit-tested.

### `supabase/migrations/0010_events.sql` (new)

- `create table if not exists events (id bigint generated always as identity primary key,
  event text not null, variant text not null, created_at timestamptz not null default now());`
- `create index if not exists events_event_created_idx on events (event, created_at);`
- RLS lockdown matching `0004_rate_limits.sql` / `0002_enable_rls.sql`:
  `enable row level security; force row level security; revoke all on events from anon,
  authenticated;` (service-role bypasses RLS — all access is server-only.)
- Idempotent (`if not exists`) and applied manually in the Supabase SQL editor, per repo
  convention. Note it in `.claude/docs/data-model.md`.

### `lib/events.ts` (new, server-only)

- `recordEvent(event: string, variant: string): Promise<void>` — validates `event` is in
  the allowlist `['backlink_land']` and `variant` is in `['home','thread']`; on a valid
  pair, inserts a row via the service-role `supabase` client. Invalid input is ignored
  (no throw, no insert) so a malformed beacon can never crash the route or pollute data.
- Server-only (imports `./supabase`); never imported by a client component.

### `app/api/track/route.ts` (new)

- `POST` handler: parse JSON body (tolerate `sendBeacon` Blob / `text/plain` content type
  — read the raw body and `JSON.parse`). Extract `event`, `variant`.
- Light per-IP rate limit reusing `checkRateLimit` (`clientIp(req)`, key `track:<ip>`) to
  stop trivial count inflation. New config constants `RATE_LIMIT_TRACK_MAX` /
  `RATE_LIMIT_TRACK_WINDOW_SEC` in `lib/config.ts` (generous — this is a high-frequency
  benign endpoint; the cap only blocks abuse). On limit, return `204` anyway (never make
  a tracking beacon visibly fail / retry).
- Call `recordEvent(event, variant)`; always return `204 No Content`. The endpoint is
  fire-and-forget: it never returns data and never surfaces errors to the client (log
  server-side via the existing `log` lib on unexpected failure).

### `components/BacklinkTracker.tsx` (new, client island)

- `'use client'`. Renders nothing. A single `useEffect` (empty deps + a module/ref guard
  to fire once per load) reads `window.location`:
  - if `new URLSearchParams(window.location.search).get('ref') === 'tg'`, compute
    `variant = backlinkVariant(window.location.pathname)` and
    `navigator.sendBeacon('/api/track', new Blob([JSON.stringify({event:'backlink_land', variant})], {type:'application/json'}))`.
  - Guard `navigator.sendBeacon` existence; fall back to `fetch('/api/track', {method:'POST', body, keepalive:true})`.
- Reading `window.location` directly (not `useSearchParams`) avoids the Next Suspense-boundary
  requirement for a render-nothing island.

### `app/layout.tsx` (modify)

- Mount `<BacklinkTracker />` once so it covers every route (both `/` and `/t/<slug>`).

## Edge Cases

- **Bots / prefetch:** the beacon only fires from real client JS on mount; non-JS bots
  never count. Imperfect but a free filter, acceptable for Q1.
- **Double counting:** `useEffect` empty-deps + fire-once guard → one beacon per landing.
  Internal SPA navigations don't carry `?ref`, so they don't fire.
- **Malformed / hostile beacon:** `recordEvent` allowlist-validates both fields and
  silently ignores anything else; the route always returns 204.
- **Privacy:** `events` stores only `event`, `variant`, `created_at`. No IP, no wallet,
  no content. IP is used transiently as a rate-limit key only and never persisted —
  consistent with the `log` lib's "never log content" rule.
- **280-char limit:** `?ref=tg` adds 7 chars; the credit tweet stays far under 280.

## Testing

- `lib/track.ts`: unit tests for `backlinkVariant` (`/t/abc` → thread, `/` → home,
  `/t` exactly → home (no trailing slug), `/history` → home).
- `lib/postToX.ts`: extend the `creditTweet` test to assert the embedded URL contains
  `?ref=tg`; add a `withRef` test (clean URL → `?ref=tg`; URL with existing `?` → `&ref=tg`).
- `app/api/track/route.ts`: route test following `share.test.ts` patterns — valid beacon
  inserts and returns 204; invalid `event`/`variant` returns 204 and does NOT insert
  (assert against a mocked supabase client). Rate-limit path returns 204.
- No test for `BacklinkTracker.tsx` (repo convention: no component/testing-library tests).

## Reading the Data (operator)

```sql
-- Total backlink clicks by variant
select variant, count(*) as clicks, max(created_at) as last_seen
from events where event = 'backlink_land'
group by variant order by clicks desc;

-- Daily trend
select date_trunc('day', created_at) as day, variant, count(*)
from events where event = 'backlink_land'
group by 1, 2 order by 1 desc;
```

If `thread` clicks meaningfully exceed `home`, that is the signal to build the deferred
deep-link fast-follow (auto-mint a slug at post time).

## Out of Scope (YAGNI)

- Conversion attribution (carrying `ref` through quote → invoice → paid).
- General homepage top-of-funnel counting (bot filtering / dedup).
- Any client analytics package, dashboard UI, or cookie-based tracking.
- UTM parameters / multi-channel `ref` values (only `tg` for now).
