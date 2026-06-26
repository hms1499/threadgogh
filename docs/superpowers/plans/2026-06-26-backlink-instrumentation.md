# Backlink Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record one landing event per backlink click, tagged by variant (`home` vs deep-link `thread`), into an append-only Supabase `events` table read with SQL — so we can tell whether the deep-link variant outperforms the homepage variant.

**Architecture:** A `?ref=tg` marker is injected at a single chokepoint (`creditTweet`) so every credit-tweet URL carries it. A client island in the root layout reads `window.location` on landing, derives the variant from the path, and fires a `navigator.sendBeacon` to `POST /api/track`, which validates an allowlist and inserts a row via the service-role client. No analytics package, no cookies.

**Tech Stack:** Next.js 16 (App Router, webpack), React 19, TypeScript 5, Supabase (service-role), Vitest 4.

## Global Constraints

- **Test command:** `npm test` from `frontend/` (Vitest). Single file: `npm test -- <path>`.
- **Build/lint:** `npm run build` and `npm run lint` from `frontend/` — webpack only (scripts already carry `--webpack`; never remove it). NOTE: the repo has PRE-EXISTING lint errors unrelated to this work (`t/[slug]/page.tsx:59`, `AppSplash.tsx:12`, `ThemeContext.tsx:22`, and issues in `page.tsx`); `npm run build` passes despite them. The bar is **no NEW lint errors from your changes + build passes** — do not "fix" pre-existing errors (scope creep).
- **Marker value:** exactly `ref=tg`.
- **Event allowlist:** `event` ∈ `['backlink_land']`; `variant` ∈ `['home','thread']`. Anything else is silently ignored (no insert, no throw).
- **Variant rule:** pathname starting with `/t/` → `'thread'`; everything else → `'home'`.
- **Privacy:** the `events` table stores ONLY `event`, `variant`, `created_at`. Never store IP, wallet, or content. IP is used transiently as a rate-limit key only.
- **`/api/track` always returns `204 No Content`** — never surfaces data or errors to the client.
- **`SUPABASE_SERVICE_ROLE_KEY` is server-only:** `lib/events.ts` imports `lib/supabase.ts` and must never be imported by a client component.
- **Migrations** are applied manually in the Supabase SQL editor (no runner); numbered files in `frontend/supabase/migrations/`.
- **Commits:** directly on `main`; commit message MUST NOT include a `Co-Authored-By: Claude` trailer.

---

### Task 1: `backlinkVariant` pure helper

**Files:**
- Create: `frontend/src/lib/track.ts`
- Test: `frontend/src/lib/__tests__/track.test.ts`

**Interfaces:**
- Produces:
  - `type BacklinkVariant = 'home' | 'thread'`
  - `backlinkVariant(pathname: string): BacklinkVariant` — `'thread'` iff `pathname` starts with `/t/`, else `'home'`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/__tests__/track.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { backlinkVariant } from '../track';

describe('backlinkVariant', () => {
  it('classifies a deep-link thread path as thread', () => {
    expect(backlinkVariant('/t/abc123')).toBe('thread');
  });

  it('classifies the homepage as home', () => {
    expect(backlinkVariant('/')).toBe('home');
  });

  it('classifies a bare /t (no slug) as home', () => {
    expect(backlinkVariant('/t')).toBe('home');
  });

  it('classifies other app paths as home', () => {
    expect(backlinkVariant('/history')).toBe('home');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/lib/__tests__/track.test.ts`
Expected: FAIL — `backlinkVariant` not exported / module missing.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/track.ts`:

```typescript
// Pure client/server-safe helper for the backlink loop. Classifies a landing
// path into the backlink variant we record: a deep-link thread page vs anything
// else (the homepage fallback). No DOM, no env.
export type BacklinkVariant = 'home' | 'thread';

export function backlinkVariant(pathname: string): BacklinkVariant {
  return pathname.startsWith('/t/') ? 'thread' : 'home';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- src/lib/__tests__/track.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/threadpay
git add frontend/src/lib/track.ts frontend/src/lib/__tests__/track.test.ts
git commit -m "feat(track): backlinkVariant helper"
```

---

### Task 2: `?ref=tg` marker via `withRef` in `creditTweet`

**Files:**
- Modify: `frontend/src/lib/postToX.ts`
- Test: `frontend/src/lib/__tests__/postToX.test.ts`

**Interfaces:**
- Consumes: existing `creditUrl`, `creditTweet` (unchanged signatures).
- Produces:
  - `withRef(url: string): string` — appends `ref=tg` using `?` if `url` has no query, else `&`.
  - `creditTweet(url)` now embeds `withRef(url)` (so every credit tweet URL carries `?ref=tg`).

- [ ] **Step 1: Write the failing tests**

In `frontend/src/lib/__tests__/postToX.test.ts`, add `withRef` to the import from `../postToX` (it already imports `creditUrl, creditTweet`), and append:

```typescript
describe('withRef', () => {
  it('appends ?ref=tg to a clean url', () => {
    expect(withRef('https://x.test/t/abc')).toBe('https://x.test/t/abc?ref=tg');
  });

  it('appends &ref=tg when the url already has a query', () => {
    expect(withRef('https://x.test/?a=1')).toBe('https://x.test/?a=1&ref=tg');
  });
});

describe('creditTweet ref marker', () => {
  it('embeds a ?ref=tg-tagged url', () => {
    const tweet = creditTweet('https://x.test/t/abc');
    expect(tweet).toContain('https://x.test/t/abc?ref=tg');
    expect(tweet.length).toBeLessThan(280);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- src/lib/__tests__/postToX.test.ts`
Expected: FAIL — `withRef` not exported; `creditTweet` output lacks `?ref=tg`.

- [ ] **Step 3: Implement**

In `frontend/src/lib/postToX.ts`, add `withRef` and change `creditTweet` to embed it. The function becomes:

```typescript
// Append the backlink-loop marker so a landing beacon can attribute the visit to a
// posted/copied thread. Picks ? or & based on whether the url already has a query.
export function withRef(url: string): string {
  return url.includes('?') ? `${url}&ref=tg` : `${url}?ref=tg`;
}

// The standalone final "credit" tweet appended to a thread on copy/post. Kept a
// separate tweet (never merged into paid content) and well under 280 chars. The
// embedded url carries the ?ref=tg marker so landings can be measured.
export function creditTweet(url: string): string {
  return `🧵 Made with ThreadGogh — generate your own X thread, pay-per-thread on Stacks 👇 ${withRef(url)}`;
}
```

(Replace the existing `creditTweet` body; do not leave the old version. `creditUrl` is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- src/lib/__tests__/postToX.test.ts`
Expected: PASS — including the pre-existing `creditTweet` test (its `toContain('https://<APP_DOMAIN>/t/abc123')` still holds, since the tagged URL contains that substring).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/threadpay
git add frontend/src/lib/postToX.ts frontend/src/lib/__tests__/postToX.test.ts
git commit -m "feat(track): inject ?ref=tg marker in creditTweet"
```

---

### Task 3: `events` table migration + `recordEvent`

**Files:**
- Create: `frontend/supabase/migrations/0010_events.sql`
- Create: `frontend/src/lib/events.ts`
- Create: `frontend/src/lib/__tests__/events.test.ts`
- Modify: `.claude/docs/data-model.md` (add the table + migration to the docs)

**Interfaces:**
- Consumes: the service-role `supabase` client from `@/lib/supabase`; `log` from `@/lib/log`.
- Produces: `recordEvent(event: string, variant: string): Promise<void>` — inserts `{event, variant}` into `events` only when both pass the allowlist; otherwise a no-op. Never throws (logs an insert error via `log.warn`).

- [ ] **Step 1: Write the migration**

Create `frontend/supabase/migrations/0010_events.sql`:

```sql
-- Append-only landing-event log for the backlink loop (Q1 instrumentation). One row per
-- real-client beacon hit; read with SQL. No PII — only event + variant + timestamp.
create table if not exists events (
  id         bigint generated always as identity primary key,
  event      text        not null,
  variant    text        not null,
  created_at timestamptz not null default now()
);

create index if not exists events_event_created_idx on events (event, created_at);

-- Same lockdown posture as invoices/rate_limits (0002/0004): all access is via the
-- service-role client, which bypasses RLS. Deny anon/authenticated the table entirely.
alter table events enable row level security;
alter table events force row level security;
revoke all on events from anon, authenticated;
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/lib/__tests__/events.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn().mockResolvedValue({ error: null });
const from = vi.fn(() => ({ insert }));
vi.mock('@/lib/supabase', () => ({ supabase: { from } }));

import { recordEvent } from '@/lib/events';

beforeEach(() => { vi.clearAllMocks(); });

describe('recordEvent', () => {
  it('inserts a valid event/variant pair', async () => {
    await recordEvent('backlink_land', 'thread');
    expect(from).toHaveBeenCalledWith('events');
    expect(insert).toHaveBeenCalledWith({ event: 'backlink_land', variant: 'thread' });
  });

  it('ignores an event outside the allowlist', async () => {
    await recordEvent('evil', 'home');
    expect(from).not.toHaveBeenCalled();
  });

  it('ignores a variant outside the allowlist', async () => {
    await recordEvent('backlink_land', 'sideways');
    expect(from).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- src/lib/__tests__/events.test.ts`
Expected: FAIL — `recordEvent` / module missing.

- [ ] **Step 4: Implement `recordEvent`**

Create `frontend/src/lib/events.ts`:

```typescript
import { supabase } from './supabase';
import { log } from './log';

// Server-only. Allowlist for the landing instrumentation — see the backlink
// instrumentation spec. Anything outside these is dropped so a hostile or malformed
// beacon can never pollute the table or crash the route.
const ALLOWED_EVENTS = ['backlink_land'];
const ALLOWED_VARIANTS = ['home', 'thread'];

// Append one landing row. No-op on invalid input; never throws (an insert failure is
// logged, not propagated — a tracking write must not break the request path).
export async function recordEvent(event: string, variant: string): Promise<void> {
  if (!ALLOWED_EVENTS.includes(event) || !ALLOWED_VARIANTS.includes(variant)) return;
  const { error } = await supabase.from('events').insert({ event, variant });
  if (error) log.warn('track.record_failed', { event, variant, err: error.message });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- src/lib/__tests__/events.test.ts`
Expected: PASS (3/3).

- [ ] **Step 6: Document the table in data-model.md**

In `.claude/docs/data-model.md`, under the "Migrations" list, add this line after the `0003_generations_regen_count.sql` entry:

```markdown
- `0010_events.sql` — append-only `events(event, variant, created_at)` for backlink landing instrumentation; RLS-locked (service-role only).
```

- [ ] **Step 7: Commit**

```bash
cd /Users/vanhuy/Desktop/threadpay
git add frontend/supabase/migrations/0010_events.sql frontend/src/lib/events.ts frontend/src/lib/__tests__/events.test.ts .claude/docs/data-model.md
git commit -m "feat(track): events table migration + recordEvent"
```

---

### Task 4: `POST /api/track` beacon endpoint

**Files:**
- Modify: `frontend/src/lib/config.ts` (add two rate-limit constants)
- Create: `frontend/src/app/api/track/route.ts`
- Create: `frontend/src/app/api/track/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `recordEvent` (Task 3); `clientIp`, `checkRateLimit` from `@/lib/rate-limit`; `log` from `@/lib/log`; `RATE_LIMIT_TRACK_MAX`, `RATE_LIMIT_TRACK_WINDOW_SEC` from `@/lib/config`.
- Produces: `POST(req): Promise<NextResponse>` — always `204`. Reads the raw body via `req.text()` then `JSON.parse`. On a passing rate-limit check, calls `recordEvent(event, variant)`.

- [ ] **Step 1: Add the config constants**

In `frontend/src/lib/config.ts`, add after the `RATE_LIMIT_QUOTE_WINDOW_SEC` line:

```typescript
// Caps the public /api/track landing beacon per IP. Generous — this is a benign,
// high-frequency endpoint; the cap only blocks crude count inflation, never real users.
export const RATE_LIMIT_TRACK_MAX = Number(process.env.RATE_LIMIT_TRACK_MAX ?? 60);
export const RATE_LIMIT_TRACK_WINDOW_SEC = Number(process.env.RATE_LIMIT_TRACK_WINDOW_SEC ?? 60);
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/app/api/track/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/events', () => ({ recordEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/rate-limit', () => ({
  clientIp: vi.fn(() => '1.2.3.4'),
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSec: 0 }),
}));

import { POST } from '../route';
import { recordEvent } from '@/lib/events';
import { checkRateLimit } from '@/lib/rate-limit';

const m = vi.mocked;

function req(rawBody: string) {
  return {
    text: async () => rawBody,
    headers: { get: () => null },
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /api/track', () => {
  it('records a valid beacon and returns 204', async () => {
    const res = await POST(req(JSON.stringify({ event: 'backlink_land', variant: 'thread' })));
    expect(res.status).toBe(204);
    expect(recordEvent).toHaveBeenCalledWith('backlink_land', 'thread');
  });

  it('returns 204 and still calls recordEvent (which drops it) for an unknown variant', async () => {
    const res = await POST(req(JSON.stringify({ event: 'backlink_land', variant: 'evil' })));
    expect(res.status).toBe(204);
    // The route forwards raw strings; the allowlist lives in recordEvent.
    expect(recordEvent).toHaveBeenCalledWith('backlink_land', 'evil');
  });

  it('returns 204 and does not record when rate-limited', async () => {
    m(checkRateLimit).mockResolvedValueOnce({ allowed: false, retryAfterSec: 60 });
    const res = await POST(req(JSON.stringify({ event: 'backlink_land', variant: 'home' })));
    expect(res.status).toBe(204);
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it('returns 204 and does not record on malformed JSON', async () => {
    const res = await POST(req('not json'));
    expect(res.status).toBe(204);
    expect(recordEvent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- src/app/api/track/__tests__/route.test.ts`
Expected: FAIL — `../route` module / `POST` missing.

- [ ] **Step 4: Implement the route**

Create `frontend/src/app/api/track/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { recordEvent } from '@/lib/events';
import { clientIp, checkRateLimit } from '@/lib/rate-limit';
import { log } from '@/lib/log';
import { RATE_LIMIT_TRACK_MAX, RATE_LIMIT_TRACK_WINDOW_SEC } from '@/lib/config';

// Fire-and-forget landing beacon for the backlink loop. Always 204 — a tracking beacon
// must never visibly fail or make the client retry. The body is sent via sendBeacon, so
// read it as raw text and parse defensively. recordEvent owns allowlist validation.
export async function POST(req: NextRequest) {
  try {
    const rl = await checkRateLimit(`track:${clientIp(req)}`, {
      max: RATE_LIMIT_TRACK_MAX, windowSec: RATE_LIMIT_TRACK_WINDOW_SEC,
    });
    if (rl.allowed) {
      const body = JSON.parse(await req.text());
      const event = typeof body?.event === 'string' ? body.event : '';
      const variant = typeof body?.variant === 'string' ? body.variant : '';
      await recordEvent(event, variant);
    }
  } catch (e) {
    log.warn('track.unhandled_error', { err: e });
  }
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- src/app/api/track/__tests__/route.test.ts`
Expected: PASS (4/4).

- [ ] **Step 6: Commit**

```bash
cd /Users/vanhuy/Desktop/threadpay
git add frontend/src/lib/config.ts frontend/src/app/api/track/route.ts frontend/src/app/api/track/__tests__/route.test.ts
git commit -m "feat(track): /api/track landing beacon endpoint"
```

---

### Task 5: `BacklinkTracker` client island + mount in layout

**Files:**
- Create: `frontend/src/components/BacklinkTracker.tsx`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Consumes: `backlinkVariant` from `@/lib/track` (Task 1); `POST /api/track` (Task 4).
- Produces: `BacklinkTracker` — a render-null client island; on a fresh landing carrying `?ref=tg`, fires one beacon to `/api/track`.

- [ ] **Step 1: Create the client island**

Create `frontend/src/components/BacklinkTracker.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { backlinkVariant } from '@/lib/track';

// Renders nothing. On a fresh landing that carries the backlink marker (?ref=tg), fire
// exactly one fire-and-forget beacon recording the variant (home vs deep-link thread).
// Reads window.location directly to avoid the useSearchParams Suspense requirement.
export function BacklinkTracker() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (new URLSearchParams(window.location.search).get('ref') !== 'tg') return;
    const variant = backlinkVariant(window.location.pathname);
    const body = JSON.stringify({ event: 'backlink_land', variant });
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/track', { method: 'POST', body, keepalive: true });
    }
  }, []);
  return null;
}
```

- [ ] **Step 2: Mount it in the root layout**

In `frontend/src/app/layout.tsx`:

Add the import near the other component imports (after the `Providers` import):

```tsx
import { BacklinkTracker } from '@/components/BacklinkTracker';
```

Then render it inside `<body>`, immediately after the theme `<script>` block and before `<ThemeProvider>`:

```tsx
        <BacklinkTracker />
```

So the body opening becomes:

```tsx
      <body>
        {/* Set the theme before first paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var s=localStorage.getItem('tg-theme');var m=(s==='light'||s==='dark')?s:'dark';var e=document.documentElement;e.dataset.theme=m;e.style.colorScheme=m;}catch(_){}})();",
          }}
        />
        <BacklinkTracker />
        <ThemeProvider>
```

- [ ] **Step 3: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: both succeed (webpack). Lint shows only the pre-existing errors named in Global Constraints — no new ones from `BacklinkTracker.tsx` or `layout.tsx`.

- [ ] **Step 4: Full test suite**

Run: `cd frontend && npm test`
Expected: PASS (guards against import/type breakage from the layout change).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/threadpay
git add frontend/src/components/BacklinkTracker.tsx frontend/src/app/layout.tsx
git commit -m "feat(track): BacklinkTracker island mounted in root layout"
```

---

## Manual Test (operator — run after all tasks)

Automated tests cover the pure logic, `recordEvent`, and the route. The end-to-end
beacon → DB path needs a real browser + the migration applied. Do these by hand:

1. **Apply the migration.** In the Supabase SQL editor (the project the running app
   points at), paste and run `frontend/supabase/migrations/0010_events.sql`. Confirm an
   `events` table now exists.

2. **Run the app** (`cd frontend && npm run dev`) or use the deployed URL.

3. **Smoke the homepage variant.** Visit `/?ref=tg` in a browser. In DevTools → Network,
   confirm a `POST /api/track` request fired and returned **204**. Then in Supabase run:
   ```sql
   select * from events order by created_at desc limit 5;
   ```
   Expect a row `event='backlink_land', variant='home'`.

4. **Smoke the thread variant.** Open any shared thread URL with the marker:
   `/t/<an-existing-slug>?ref=tg`. Confirm another `POST /api/track` → 204, then re-run the
   query above and expect a new row with `variant='thread'`.

5. **Confirm no marker = no event.** Visit `/` (no `?ref=tg`). Confirm NO `POST /api/track`
   fires and no new `events` row appears.

6. **Read the numbers** (the queries the spec ships):
   ```sql
   select variant, count(*) as clicks, max(created_at) as last_seen
   from events where event = 'backlink_land'
   group by variant order by clicks desc;

   select date_trunc('day', created_at) as day, variant, count(*)
   from events where event = 'backlink_land'
   group by 1, 2 order by 1 desc;
   ```

Interpretation: if `thread` clicks meaningfully exceed `home` over time, that is the
signal to build the deferred deep-link fast-follow (auto-mint a slug at post time).

---

## Self-Review

**Spec coverage:**
- `?ref=tg` marker chokepoint in `creditTweet` (covers shareUrl- and creditUrl-built links) → Task 2. ✅
- `backlinkVariant` path classification → Task 1. ✅
- `events` table + RLS lockdown + manual-apply migration + data-model note → Task 3. ✅
- `recordEvent` allowlist validation (silent drop, never throws) → Task 3. ✅
- `POST /api/track` always-204 beacon, light per-IP rate limit, defensive body parse → Task 4. ✅
- `BacklinkTracker` client island reading window.location, fire-once, sendBeacon+fetch fallback, mounted in layout → Task 5. ✅
- Privacy (only event/variant/created_at; no IP/wallet/content) → Task 3 schema + Task 4 (IP only as RL key). ✅
- SQL reading + manual E2E test → Manual Test section. ✅
- Out-of-scope items (conversion attribution, homepage funnel, analytics package, UTM) → not introduced. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `backlinkVariant(pathname): BacklinkVariant` defined Task 1, consumed Task 5; `withRef(url: string): string` / `creditTweet(url)` Task 2; `recordEvent(event: string, variant: string): Promise<void>` defined Task 3, consumed Task 4; `RATE_LIMIT_TRACK_MAX`/`RATE_LIMIT_TRACK_WINDOW_SEC` defined Task 4 step 1, used Task 4 step 4; event string `'backlink_land'` and variants `'home'`/`'thread'` identical across helper, beacon, recordEvent, and SQL. ✅
