# Public Thread Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every generated thread an opt-in, wallet-authorized, shareable public URL at `/t/[slug]`.

**Architecture:** A new `share_slug` column on `generations` (NULL = private). A `POST/DELETE /api/share` route, gated by wallet signature against the on-chain `payer_address` (same pattern as `/api/regenerate`), mints/clears the slug. A public Server Component page reads the generation by slug and renders the thread, an on-chain payment badge, and a "create your own" CTA, plus a dynamic OG image.

**Tech Stack:** Next.js 16 (App Router, **modified build — see Global Constraints**), React 19, TypeScript, Supabase (service-role server client), Ant Design, Vitest.

## Global Constraints

- **Webpack only.** Never add/remove the `--webpack` flag on `dev`/`build`.
- **This Next.js is modified.** Before writing ANY page/route/metadata/OG code, read the relevant guide under `frontend/node_modules/next/dist/docs/` (per `frontend/AGENTS.md`). Async `params`, `generateMetadata`, file-based metadata (`opengraph-image`), and route handlers may differ from training data.
- **On-chain receipt is the source of truth for payment.** Never trust client input for ownership; the share route authenticates to an address and compares it to the generation's stored `payer_address`.
- **`SUPABASE_SERVICE_ROLE_KEY` / `lib/supabase.ts` is server-only.** Never import it into a client component.
- **Network from `NEXT_PUBLIC_STACKS_NETWORK`** (default `testnet`), resolved in `lib/config.ts`.
- **Commit style:** commit directly on `main`; small incremental commits; **no `Co-Authored-By: Claude` trailer.**
- Run commands from `frontend/`. Test: `npm test` (vitest). Build: `npm run build`.

---

### Task 1: Migration 0009 — share columns on `generations`

**Files:**
- Create: `frontend/supabase/migrations/0009_generations_share_slug.sql`

**Interfaces:**
- Produces: two new columns on `generations` — `share_slug TEXT UNIQUE` (NULL = private), `shared_at TIMESTAMPTZ`. Later tasks read/write these.

- [ ] **Step 1: Write the migration**

Create `frontend/supabase/migrations/0009_generations_share_slug.sql`:

```sql
-- Opt-in public sharing. A generated thread is private until its owner mints a
-- random share_slug (via /api/share, gated by wallet signature). NULL slug =
-- private; the UNIQUE constraint doubles as the public-lookup index and lets
-- NULLs coexist freely. shared_at records when it was made public.
alter table generations add column if not exists share_slug text;
alter table generations add column if not exists shared_at timestamptz;
create unique index if not exists generations_share_slug_key
  on generations (share_slug);
```

- [ ] **Step 2: Verify it reads correctly**

Re-read the file. Confirm: lowercase SQL matching the style of `0008_invoices_preview_outline.sql`, `if not exists` guards present, and the column names exactly `share_slug` / `shared_at`. (Migrations are applied manually in Supabase; there is no vitest cycle for this file.)

- [ ] **Step 3: Commit**

```bash
git add frontend/supabase/migrations/0009_generations_share_slug.sql
git commit -m "feat(share): migration 0009 — generations.share_slug + shared_at"
```

---

### Task 2: `lib/share.ts` — public read + slug mutators

**Files:**
- Modify: `frontend/src/lib/invoices.ts` (extend `Generation` type)
- Modify: `frontend/src/lib/history.ts` (export `displayTopic`)
- Create: `frontend/src/lib/share.ts`
- Create: `frontend/src/lib/__tests__/share.test.ts`

**Interfaces:**
- Consumes: `displayTopic(rel)` from `history.ts`; `supabase` from `lib/supabase.ts`.
- Produces:
  - `Generation.share_slug?: string | null` (on the existing `Generation` type).
  - `type PublicThread = { invoice_id: string; service_id: string; token: string; amount: number; tx_id: string; thread_content: string[]; topic: string | null }`
  - `normalizePublicRow(raw): PublicThread` (pure)
  - `getGenerationBySlug(slug: string): Promise<PublicThread | null>`
  - `mintShareSlug(invoiceId: string): Promise<string>`
  - `clearShareSlug(invoiceId: string): Promise<void>`

- [ ] **Step 1: Extend the `Generation` type**

In `frontend/src/lib/invoices.ts`, add `share_slug` to the `Generation` type (it is selected by the existing `getGeneration`'s `select('*')`):

```ts
export type Generation = {
  invoice_id: string;
  service_id: string;
  payer_address: string;
  token: string;
  amount: number;
  tx_id: string;
  thread_content: string[];
  regen_count?: number;
  share_slug?: string | null;
};
```

- [ ] **Step 2: Export `displayTopic` from `history.ts`**

In `frontend/src/lib/history.ts`, change the `displayTopic` declaration from `function displayTopic(` to `export function displayTopic(`. Leave its body unchanged. Also export its parameter type if not already exported — change `type InvoiceRel = {` to `export type InvoiceRel = {`.

- [ ] **Step 3: Write the failing test for `normalizePublicRow`**

Create `frontend/src/lib/__tests__/share.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

// share.ts imports the service-role client at module load; the pure helper under
// test never touches it, so a bare stub is enough (mirrors history.test.ts).
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { vi } from 'vitest';
import { normalizePublicRow } from '@/lib/share';

const rawRow = (over: Record<string, unknown> = {}) => ({
  invoice_id: 'a'.repeat(64),
  service_id: 'hot-takes',
  token: 'STX',
  amount: 100000,
  tx_id: '0xtx',
  thread_content: ['hook', 'cta'],
  invoices: { topic: 'bitcoin layer 2' },
  ...over,
});

describe('normalizePublicRow', () => {
  it('flattens the to-one invoices relation to a top-level topic', () => {
    const t = normalizePublicRow(rawRow());
    expect(t.topic).toBe('bitcoin layer 2');
    expect('invoices' in t).toBe(false);
    expect(t.invoice_id).toBe('a'.repeat(64));
    expect(t.thread_content).toEqual(['hook', 'cta']);
  });

  it('handles invoices arriving as an array', () => {
    expect(normalizePublicRow(rawRow({ invoices: [{ topic: 'arrayed' }] })).topic).toBe('arrayed');
  });

  it('yields null topic when the relation is missing', () => {
    expect(normalizePublicRow(rawRow({ invoices: null })).topic).toBeNull();
  });

  it('defaults a null service_id to x-thread (pre-marketplace rows)', () => {
    expect(normalizePublicRow(rawRow({ service_id: null })).service_id).toBe('x-thread');
  });
});
```

> Note: `vi` must be imported before use — adjust the import order so `import { vi } from 'vitest'` sits with the other `vitest` import at the top. (Combine into `import { describe, it, expect, vi } from 'vitest';`.)

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- src/lib/__tests__/share.test.ts`
Expected: FAIL — `normalizePublicRow` is not exported from `@/lib/share` (module not found / undefined).

- [ ] **Step 5: Implement `lib/share.ts`**

Create `frontend/src/lib/share.ts`:

```ts
import crypto from 'crypto';
import { supabase } from './supabase';
import { displayTopic, type InvoiceRel } from './history';

// Server-only. Owns sharing's DB shape. Ownership (signer == payer_address) is
// enforced by the route before these are called (mirrors the regenerate flow).

export type PublicThread = {
  invoice_id: string;
  service_id: string;
  token: string;
  amount: number;
  tx_id: string;
  thread_content: string[];
  topic: string | null;
};

type RawPublicRow = {
  invoice_id: string;
  service_id: string | null;
  token: string;
  amount: number;
  tx_id: string;
  thread_content: string[];
  invoices: InvoiceRel | InvoiceRel[] | null;
};

// Pure: flatten a generations row joined to its invoice into the public shape.
export function normalizePublicRow(raw: RawPublicRow): PublicThread {
  const rel = Array.isArray(raw.invoices) ? raw.invoices[0] : raw.invoices;
  return {
    invoice_id: raw.invoice_id,
    service_id: raw.service_id ?? 'x-thread',
    token: raw.token,
    amount: raw.amount,
    tx_id: raw.tx_id,
    thread_content: raw.thread_content,
    topic: displayTopic(rel ?? undefined),
  };
}

// Public-page read. A NULL share_slug never matches, so private threads (and
// junk slugs) return null.
export async function getGenerationBySlug(slug: string): Promise<PublicThread | null> {
  const { data, error } = await supabase
    .from('generations')
    .select('invoice_id, service_id, token, amount, tx_id, thread_content, invoices(topic, params)')
    .eq('share_slug', slug)
    .maybeSingle();
  if (error) throw new Error(`getGenerationBySlug: ${error.message}`);
  return data ? normalizePublicRow(data as unknown as RawPublicRow) : null;
}

// Mint a fresh slug for an already-private generation. Only updates the row when
// share_slug is still NULL; if a concurrent request beat us, re-read and return
// the slug that won. Caller has already verified ownership and that no slug exists.
export async function mintShareSlug(invoiceId: string): Promise<string> {
  const slug = crypto.randomBytes(16).toString('base64url');
  const { data, error } = await supabase
    .from('generations')
    .update({ share_slug: slug, shared_at: new Date().toISOString() })
    .eq('invoice_id', invoiceId)
    .is('share_slug', null)
    .select('share_slug')
    .maybeSingle();
  if (error) throw new Error(`mintShareSlug: ${error.message}`);
  if (data?.share_slug) return data.share_slug;
  // Lost the race: a concurrent mint set it first. Re-read the winning slug.
  const reread = await supabase
    .from('generations').select('share_slug').eq('invoice_id', invoiceId).maybeSingle();
  if (reread.error) throw new Error(`mintShareSlug reread: ${reread.error.message}`);
  if (!reread.data?.share_slug) throw new Error('mintShareSlug: no slug after update');
  return reread.data.share_slug;
}

// Un-share: drop the slug (and timestamp). Idempotent.
export async function clearShareSlug(invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('generations')
    .update({ share_slug: null, shared_at: null })
    .eq('invoice_id', invoiceId);
  if (error) throw new Error(`clearShareSlug: ${error.message}`);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/lib/__tests__/share.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Verify the wider suite still passes (history export change)**

Run: `npm test -- src/lib/__tests__/history.test.ts`
Expected: PASS — exporting `displayTopic`/`InvoiceRel` is non-breaking.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/share.ts frontend/src/lib/__tests__/share.test.ts frontend/src/lib/invoices.ts frontend/src/lib/history.ts
git commit -m "feat(share): lib/share.ts — public read + slug mint/clear"
```

---

### Task 3: `explorerTxUrl` helper in `lib/config.ts`

**Files:**
- Modify: `frontend/src/lib/config.ts`
- Modify: `frontend/src/components/VanGoghCanvas.tsx:53` (use the helper)
- Modify: `frontend/src/components/PaymentStatus.tsx:66` (use the helper)
- Create: `frontend/src/lib/__tests__/config-explorer.test.ts`

**Interfaces:**
- Produces: `explorerTxUrl(txId: string): string` — `https://explorer.hiro.so/txid/{txId}?chain={STACKS_NETWORK}`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/__tests__/config-explorer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { explorerTxUrl, STACKS_NETWORK } from '@/lib/config';

describe('explorerTxUrl', () => {
  it('builds a Hiro explorer txid URL for the active network', () => {
    expect(explorerTxUrl('0xabc')).toBe(
      `https://explorer.hiro.so/txid/0xabc?chain=${STACKS_NETWORK}`,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/__tests__/config-explorer.test.ts`
Expected: FAIL — `explorerTxUrl` is not exported from `@/lib/config`.

- [ ] **Step 3: Add the helper to `config.ts`**

In `frontend/src/lib/config.ts`, after the `STACKS_NETWORK` export, add:

```ts
// Hiro explorer link for a transaction id, on the active network. Centralizes the
// URL so the share page, payment status, and loader all stay in sync.
export function explorerTxUrl(txId: string): string {
  return `https://explorer.hiro.so/txid/${txId}?chain=${STACKS_NETWORK}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/__tests__/config-explorer.test.ts`
Expected: PASS.

- [ ] **Step 5: DRY the two existing call sites**

In `frontend/src/components/VanGoghCanvas.tsx`, ensure `explorerTxUrl` is imported from `@/lib/config` and replace the inline literal at line 53:

```tsx
href={explorerTxUrl(tx)}
```

In `frontend/src/components/PaymentStatus.tsx`, import `explorerTxUrl` from `@/lib/config` and replace the inline literal at line 66:

```tsx
href={explorerTxUrl(txid)}
```

(If either file imports `STACKS_NETWORK` only for that literal, remove the now-unused import.)

- [ ] **Step 6: Verify build + full suite**

Run: `npm run build`
Expected: build succeeds, no unused-import/type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/config.ts frontend/src/lib/__tests__/config-explorer.test.ts frontend/src/components/VanGoghCanvas.tsx frontend/src/components/PaymentStatus.tsx
git commit -m "feat(share): explorerTxUrl helper, reused across loader/status"
```

---

### Task 4: `POST/DELETE /api/share` route

**Files:**
- Create: `frontend/src/app/api/share/route.ts`
- Create: `frontend/src/app/api/share/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `authenticateAddress`, `applySessionCookie` (`lib/request-auth`); `getGeneration` (`lib/invoices`); `mintShareSlug`, `clearShareSlug` (`lib/share`).
- Produces: `POST` returns `{ slug }` (200); `DELETE` returns `{ ok: true }` (200). Errors: 400 / 401 / 403 / 404.

- [ ] **Step 1: Read the Next.js route-handler docs**

Before writing the route, read the route-handler guide under `frontend/node_modules/next/dist/docs/` (per `frontend/AGENTS.md`) to confirm `NextRequest`/`NextResponse` usage and the `DELETE` export convention on this build. Mirror the existing `frontend/src/app/api/regenerate/route.ts` shape.

- [ ] **Step 2: Write the failing route tests**

Create `frontend/src/app/api/share/__tests__/route.test.ts` (mirrors `regenerate/__tests__/route.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/invoices', () => ({ getGeneration: vi.fn() }));
vi.mock('@/lib/share', () => ({ mintShareSlug: vi.fn(), clearShareSlug: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyHistoryAuth: vi.fn() }));
vi.mock('@/lib/session', () => ({
  SESSION_COOKIE: 'tg_session',
  verifySessionToken: vi.fn(),
  createSessionToken: vi.fn(() => 'minted-token'),
  sessionCookieOptions: vi.fn(() => ({ path: '/' })),
}));

import { POST, DELETE } from '../route';
import * as invoices from '@/lib/invoices';
import * as share from '@/lib/share';
import { verifyHistoryAuth } from '@/lib/auth';
import { verifySessionToken } from '@/lib/session';

const m = vi.mocked;
const INVOICE_ID = 'a'.repeat(64);
const PAYER = 'ST1PAYER';

function req(body: unknown, cookie?: string) {
  return {
    json: async () => body,
    cookies: { get: () => (cookie ? { value: cookie } : undefined) },
  } as unknown as Parameters<typeof POST>[0];
}

function gen(overrides: Partial<invoices.Generation> = {}): invoices.Generation {
  return {
    invoice_id: INVOICE_ID, service_id: 'x-thread', payer_address: PAYER,
    token: 'STX', amount: 100000, tx_id: '0xtx', thread_content: ['hook', 'cta'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m(verifySessionToken).mockReturnValue({ address: PAYER });
});

describe('POST /api/share', () => {
  it('400 on a malformed invoiceId', async () => {
    const res = await POST(req({ invoiceId: 'nope' }, 'cookie'));
    expect(res.status).toBe(400);
  });

  it('401 when unauthenticated', async () => {
    m(verifySessionToken).mockReturnValue(null);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(401);
  });

  it('404 when no generation exists', async () => {
    m(invoices.getGeneration).mockResolvedValue(null);
    const res = await POST(req({ invoiceId: INVOICE_ID }, 'cookie'));
    expect(res.status).toBe(404);
  });

  it('403 when the signer is not the payer', async () => {
    m(invoices.getGeneration).mockResolvedValue(gen({ payer_address: 'ST1OTHER' }));
    const res = await POST(req({ invoiceId: INVOICE_ID }, 'cookie'));
    expect(res.status).toBe(403);
    expect(share.mintShareSlug).not.toHaveBeenCalled();
  });

  it('mints a slug for the owner', async () => {
    m(invoices.getGeneration).mockResolvedValue(gen());
    m(share.mintShareSlug).mockResolvedValue('SLUG123');
    const res = await POST(req({ invoiceId: INVOICE_ID }, 'cookie'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ slug: 'SLUG123' });
    expect(share.mintShareSlug).toHaveBeenCalledWith(INVOICE_ID);
  });

  it('is idempotent: returns the existing slug without re-minting', async () => {
    m(invoices.getGeneration).mockResolvedValue(gen({ share_slug: 'EXISTING' }));
    const res = await POST(req({ invoiceId: INVOICE_ID }, 'cookie'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ slug: 'EXISTING' });
    expect(share.mintShareSlug).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/share', () => {
  it('403 when the signer is not the payer', async () => {
    m(invoices.getGeneration).mockResolvedValue(gen({ payer_address: 'ST1OTHER' }));
    const res = await DELETE(req({ invoiceId: INVOICE_ID }, 'cookie'));
    expect(res.status).toBe(403);
    expect(share.clearShareSlug).not.toHaveBeenCalled();
  });

  it('clears the slug for the owner', async () => {
    m(invoices.getGeneration).mockResolvedValue(gen({ share_slug: 'EXISTING' }));
    m(share.clearShareSlug).mockResolvedValue(undefined);
    const res = await DELETE(req({ invoiceId: INVOICE_ID }, 'cookie'));
    expect(res.status).toBe(200);
    expect(share.clearShareSlug).toHaveBeenCalledWith(INVOICE_ID);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- src/app/api/share/__tests__/route.test.ts`
Expected: FAIL — `../route` has no `POST`/`DELETE` exports.

- [ ] **Step 4: Implement the route**

Create `frontend/src/app/api/share/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getGeneration } from '@/lib/invoices';
import { mintShareSlug, clearShareSlug } from '@/lib/share';
import { authenticateAddress, applySessionCookie } from '@/lib/request-auth';

// invoice ids are 32 random bytes, hex (64 chars).
const INVOICE_RE = /^[0-9a-f]{64}$/;

// Resolve { invoiceId, auth } and the owning generation, enforcing that the
// signer is the on-chain payer. Shared by POST (mint) and DELETE (revoke).
async function authorizeOwner(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const invoiceId = body && typeof body.invoiceId === 'string' ? body.invoiceId : '';
  if (!INVOICE_RE.test(invoiceId)) {
    return { error: NextResponse.json({ error: 'invoiceId is required' }, { status: 400 }) };
  }
  const auth = authenticateAddress(req, body);
  if (!auth.ok) {
    return { error: NextResponse.json({ error: `unauthorized: ${auth.reason}` }, { status: 401 }) };
  }
  const generation = await getGeneration(invoiceId);
  if (!generation) {
    return { error: NextResponse.json({ error: 'nothing to share' }, { status: 404 }) };
  }
  // The on-chain payer owns the thread — client input alone can never authorize.
  if (generation.payer_address !== auth.address) {
    return { error: NextResponse.json({ error: 'not your thread' }, { status: 403 }) };
  }
  return { invoiceId, generation, auth };
}

export async function POST(req: NextRequest) {
  try {
    const r = await authorizeOwner(req);
    if (r.error) return r.error;
    // Idempotent: an already-public thread returns its existing slug.
    const slug = r.generation.share_slug ?? (await mintShareSlug(r.invoiceId));
    const res = NextResponse.json({ slug });
    if (r.auth.mintCookie) applySessionCookie(res, r.auth.address);
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'share failed' }, { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const r = await authorizeOwner(req);
    if (r.error) return r.error;
    await clearShareSlug(r.invoiceId);
    const res = NextResponse.json({ ok: true });
    if (r.auth.mintCookie) applySessionCookie(res, r.auth.address);
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unshare failed' }, { status: 500 },
    );
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/app/api/share/__tests__/route.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/share/route.ts frontend/src/app/api/share/__tests__/route.test.ts
git commit -m "feat(share): POST/DELETE /api/share route (wallet-gated)"
```

---

### Task 5: `ShareButton` + wire share flow into `page.tsx`

**Files:**
- Create: `frontend/src/components/ShareButton.tsx`
- Modify: `frontend/src/app/page.tsx` (share state, `shareThread`/`unshareThread`, render in the "Your thread" header)

**Interfaces:**
- Consumes: the existing wallet-signature auth dance in `page.tsx` (`signInWithWallet`, `getAddress`, `address`) and `displayedInvoiceId`.
- Produces: `ShareButton` presentational component:
  `ShareButton({ shared, sharing, shareUrl, onShare, onCopy }: { shared: boolean; sharing: boolean; shareUrl: string | null; onShare: () => void; onCopy: () => void })`

- [ ] **Step 1: Implement the presentational `ShareButton`**

Create `frontend/src/components/ShareButton.tsx`:

```tsx
'use client';

import { Button, Flex, Typography, App } from 'antd';
import { ShareAltOutlined, LinkOutlined } from '@ant-design/icons';

const { Text } = Typography;

// Presentational only — the share network call + wallet signing live in page.tsx
// (where the auth dance already exists). Before share: a "Share" button. After:
// the public link with a copy affordance.
export function ShareButton({ shared, sharing, shareUrl, onShare, onCopy }: {
  shared: boolean; sharing: boolean; shareUrl: string | null;
  onShare: () => void; onCopy: () => void;
}) {
  const { message } = App.useApp();
  if (shared && shareUrl) {
    return (
      <Flex gap={6} align="center">
        <Text type="secondary" ellipsis style={{ maxWidth: 220 }}>{shareUrl}</Text>
        <Button
          size="small"
          icon={<LinkOutlined />}
          onClick={() => { onCopy(); message.success('Share link copied'); }}
        >
          Copy link
        </Button>
      </Flex>
    );
  }
  return (
    <Button size="small" icon={<ShareAltOutlined />} loading={sharing} onClick={onShare}>
      Share
    </Button>
  );
}
```

- [ ] **Step 2: Add share state + handlers in `page.tsx`**

In `frontend/src/app/page.tsx`, add state near the other thread state (around the `thread` / `regenRemaining` declarations):

```tsx
const [shareUrl, setShareUrl] = useState<string | null>(null);
const [sharing, setSharing] = useState(false);
```

Add a `postShare` auth dance mirroring `postRegenerate` (same try-session-then-sign pattern), plus a `shareThread` handler. Place them next to `regenerate`:

```tsx
// Same auth dance as re-roll: try the session cookie, sign only on 401.
async function postShare(payload: object) {
  const call = (auth: object) => fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, ...auth }),
  });
  let res = await call({});
  if (res.status === 401) {
    const addr = getAddress() ?? address;
    if (!addr) throw new Error('Connect your wallet to share.');
    res = await call(await signInWithWallet(addr));
  }
  return res;
}

async function shareThread() {
  if (!displayedInvoiceId) return;
  setSharing(true);
  try {
    const res = await postShare({ invoiceId: displayedInvoiceId });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
    setShareUrl(`${window.location.origin}/t/${data.slug}`);
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Share failed');
  } finally {
    setSharing(false);
  }
}
```

Reset `shareUrl` wherever a new thread starts. In `handleGenerate` (the long `set...` reset line) and in the re-roll handlers where the thread is replaced is unnecessary, but at minimum add `setShareUrl(null);` to the `handleGenerate` reset line so a new generation doesn't show a stale link.

- [ ] **Step 3: Render `ShareButton` in the "Your thread" header**

Import it at the top of `page.tsx`:

```tsx
import { ShareButton } from '@/components/ShareButton';
```

In the action `Flex` inside the "Your thread" header (the `<Flex gap={8} align="center">` around page.tsx:358, beside the copy-whole-thread button), add:

```tsx
<ShareButton
  shared={!!shareUrl}
  sharing={sharing}
  shareUrl={shareUrl}
  onShare={shareThread}
  onCopy={() => { if (shareUrl) navigator.clipboard.writeText(shareUrl); }}
/>
```

- [ ] **Step 4: Verify build + typecheck**

Run: `npm run build`
Expected: build succeeds. (No vitest here — this repo tests pure helpers, not rendered components; `ShareButton` is presentational and `page.tsx` wiring is covered by the build + manual check below.)

- [ ] **Step 5: Manual smoke (note for the executor)**

With `npm run dev`, generate/pay a thread, click **Share**, confirm a `/t/<slug>` link appears and copies. (Requires a funded testnet wallet; if unavailable, rely on the build + the route tests from Task 4.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ShareButton.tsx frontend/src/app/page.tsx
git commit -m "feat(share): Share button + flow on generated thread"
```

---

### Task 6: Public page `/t/[slug]`

**Files:**
- Create: `frontend/src/app/t/[slug]/page.tsx` (Server Component)
- Create: `frontend/src/components/PublicThreadActions.tsx` (client island: copy + post-to-X)

**Interfaces:**
- Consumes: `getGenerationBySlug` (`lib/share`), `getService`/`publicRegistry` (`lib/services/registry`), `explorerTxUrl` (`lib/config`), `TweetCard`, `PostThreadModal`.
- Produces: a public route at `/t/[slug]`; `notFound()` (404) for unknown/unshared slugs.

- [ ] **Step 1: Read the Next.js docs for pages, dynamic params, and metadata**

Read the relevant guides under `frontend/node_modules/next/dist/docs/` (per `frontend/AGENTS.md`): App Router pages, **dynamic route params** (whether `params` is a Promise to `await` on this build), `notFound()`, and `generateMetadata`. Write the page to match what the docs show — do NOT assume the training-data shape.

- [ ] **Step 2: Implement the client actions island**

Create `frontend/src/components/PublicThreadActions.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button, Flex, App } from 'antd';
import { CopyOutlined, TwitterOutlined } from '@ant-design/icons';
import { PostThreadModal } from '@/components/PostThreadModal';

// Client island for the public page: copy the whole thread, or walk the
// post-to-X flow. Reuses PostThreadModal. `chained` controls i/n numbering.
export function PublicThreadActions({ thread, chained }: { thread: string[]; chained: boolean }) {
  const { message } = App.useApp();
  const [postOpen, setPostOpen] = useState(false);
  return (
    <Flex gap={8} align="center">
      <Button
        icon={<CopyOutlined />}
        onClick={() => {
          navigator.clipboard.writeText(thread.join('\n\n'));
          message.success('Whole thread copied');
        }}
      >
        Copy
      </Button>
      <Button type="primary" icon={<TwitterOutlined />} onClick={() => setPostOpen(true)}>
        Post to X
      </Button>
      <PostThreadModal thread={thread} chained={chained} open={postOpen} onClose={() => setPostOpen(false)} />
    </Flex>
  );
}
```

- [ ] **Step 3: Implement the public page**

Create `frontend/src/app/t/[slug]/page.tsx`. Use the exact `params` shape the docs in Step 1 confirmed (the example below assumes the Promise form — adjust if the docs differ):

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Flex, Typography } from 'antd';
import { getGenerationBySlug } from '@/lib/share';
import { getService } from '@/lib/services/registry';
import { explorerTxUrl } from '@/lib/config';
import { TweetCard } from '@/components/TweetCard';
import { PublicThreadActions } from '@/components/PublicThreadActions';

const { Title, Text, Paragraph } = Typography;

function serviceLabel(serviceId: string): { label: string; chained: boolean } {
  try {
    const s = getService(serviceId);
    return { label: s.label, chained: s.chained };
  } catch {
    return { label: 'Thread', chained: true };
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = await getGenerationBySlug(slug);
  if (!t) return { title: 'Thread not found · ThreadGogh' };
  const title = t.topic ? `${t.topic} · ThreadGogh` : 'A thread · ThreadGogh';
  return { title, description: t.thread_content[0]?.slice(0, 200) ?? 'Generated with ThreadGogh.' };
}

export default async function PublicThreadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const thread = await getGenerationBySlug(slug);
  if (!thread) notFound();

  const { label, chained } = serviceLabel(thread.service_id);
  const tweets = thread.thread_content;

  return (
    <Flex vertical gap={16} style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <div>
          <Text type="secondary">{label}</Text>
          {thread.topic && <Title level={3} style={{ margin: 0 }}>{thread.topic}</Title>}
        </div>
        <PublicThreadActions thread={tweets} chained={chained} />
      </Flex>

      <Paragraph type="secondary" style={{ margin: 0 }}>
        Paid with {thread.token} on Stacks ·{' '}
        <a href={explorerTxUrl(thread.tx_id)} target="_blank" rel="noopener noreferrer">view tx</a>
      </Paragraph>

      <Flex vertical gap={12}>
        {tweets.map((t, i) => (
          <TweetCard key={i} text={t} index={i} total={tweets.length} />
        ))}
      </Flex>

      <Flex justify="center" style={{ marginTop: 24 }}>
        <a href="/"><Title level={4} style={{ margin: 0 }}>✍️ Create your own thread →</Title></a>
      </Flex>
    </Flex>
  );
}
```

> `TweetCard` renders its edit/delete/reroll affordances only when the matching `onEdit`/`onDelete`/`onReroll` props are passed. Omitting them (as above) yields a read-only card — correct for a public page. Confirm this by reading `TweetCard.tsx` before finishing; if any control shows unconditionally, pass `undefined` explicitly or add a `readOnly` guard.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds; `/t/[slug]` appears in the route output as a dynamic route.

- [ ] **Step 5: Manual smoke (note for the executor)**

Visit `/t/<a-real-shared-slug>` → thread + badge + CTA render; visit `/t/bogus` → 404. (Use a slug minted via Task 5, or insert a test `share_slug` directly in Supabase.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/t frontend/src/components/PublicThreadActions.tsx
git commit -m "feat(share): public /t/[slug] thread page"
```

---

### Task 7: Dynamic OG image for `/t/[slug]`

**Files:**
- Create: `frontend/src/app/t/[slug]/opengraph-image.tsx`

**Interfaces:**
- Consumes: `getGenerationBySlug` (`lib/share`).
- Produces: a per-thread Open Graph image at the `/t/[slug]` route.

- [ ] **Step 1: Read the OG-image docs for this Next.js build**

Read the metadata-files / `opengraph-image` and `ImageResponse` (`next/og`) guides under `frontend/node_modules/next/dist/docs/`. Confirm the file convention, the `size`/`contentType` exports, the `params` shape, and the `runtime` export (edge vs node) this build expects. **If `ImageResponse`/`next/og` is unavailable or behaves differently, STOP and fall back:** create a static `frontend/src/app/t/[slug]/opengraph-image.png` (or set a fixed `openGraph.images` in the page's `generateMetadata`) instead, and note the deviation in the commit message.

- [ ] **Step 2: Implement the dynamic OG image (assuming `next/og` is supported)**

Create `frontend/src/app/t/[slug]/opengraph-image.tsx`. Adjust exports to match Step 1's docs:

```tsx
import { ImageResponse } from 'next/og';
import { getGenerationBySlug } from '@/lib/share';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const thread = await getGenerationBySlug(slug);
  const hook = thread?.thread_content[0]?.slice(0, 180) ?? 'A thread generated with ThreadGogh';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: 64, background: '#0f0f17', color: '#f5f5f5',
          fontSize: 48, fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', lineHeight: 1.2 }}>{hook}</div>
        <div style={{ display: 'flex', fontSize: 28, color: '#9aa0aa' }}>ThreadGogh · paid on Stacks</div>
      </div>
    ),
    { ...size },
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds; no `next/og` import or edge-runtime errors. (If it fails, apply the Step 1 static fallback.)

- [ ] **Step 4: Manual smoke (note for the executor)**

Request the OG image route for a shared slug (the build output lists its path, typically `/t/<slug>/opengraph-image`) and confirm a 1200×630 PNG renders with the hook text. Optionally validate the page's social preview with a card validator.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/t/[slug]/opengraph-image.tsx
git commit -m "feat(share): dynamic OG image for /t/[slug]"
```

---

## Self-Review

**Spec coverage:**
- Opt-in privacy → Task 1 (NULL slug) + Task 5 (explicit Share action). ✓
- Wallet-signature share, signer == payer → Task 4 (`authorizeOwner`). ✓
- Separate slug, never `invoice_id` → Task 1 + Task 2 (`base64url` slug). ✓
- Storage = column on `generations` (Approach A) → Task 1. ✓
- Lib `createShare`/`revokeShare`/`getGenerationBySlug` → implemented as `mintShareSlug`/`clearShareSlug` (idempotency + ownership hoisted into the route to match the repo's regenerate pattern and stay route-testable) + `getGenerationBySlug`. **Deviation from spec naming, same behavior** — noted here intentionally. ✓
- API POST + DELETE with 400/401/403/404 → Task 4. ✓
- Public page: thread + on-chain badge + service/topic + CTA + copy/post island → Task 6. ✓
- Dynamic OG with static fallback → Task 7. ✓
- Explorer helper → Task 3. ✓
- Privacy (no invoice_id/params/payer leak) → Task 6 selects only public fields via `getGenerationBySlug`. ✓
- Tests per spec → Task 2 (pure normalize), Task 4 (route branches incl. idempotent + wrong-owner + unauth + bad id). Page/OG verified by build + manual, consistent with this repo's no-RSC-test convention. ✓

**Placeholder scan:** none — every code/test step is complete.

**Type consistency:** `Generation.share_slug` (Task 2) is read in Task 4. `PublicThread`/`normalizePublicRow` (Task 2) consumed in Tasks 6–7. `explorerTxUrl` (Task 3) consumed in Task 6. `ShareButton` prop shape consistent between Task 5 definition and render. `getGenerationBySlug` signature stable across Tasks 6–7.
