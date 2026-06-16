# Free Re-roll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After paying, let the user regenerate the whole thread up to `MAX_FREE_REGENS` times at no extra charge.

**Architecture:** A new `POST /api/regenerate` endpoint (separate from the payment state machine) verifies the invoice is `consumed` and a generation exists, then re-runs `generateThread` and overwrites the stored thread via a compare-and-swap update that increments `regen_count`. The CAS makes concurrent clicks safe (no over-count, no clobber). Gate = knowledge of the 64-hex `invoiceId` + the N-limit; no session signature in v1.

**Tech Stack:** Next.js 16 App Router route handlers, Supabase (service-role), Vitest, Ant Design.

Run all `npm` commands from `frontend/`. Tests: `npm test`. Webpack only.

Build this **after** or independently of the hook-preview plan — they don't share files except `lib/config.ts` and `page.tsx` (non-overlapping edits).

---

### Task 1: Migration + config constant

**Files:**
- Create: `frontend/supabase/migrations/0003_generations_regen_count.sql`
- Modify: `frontend/src/lib/config.ts`
- Modify (docs): `.claude/docs/data-model.md`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Migration: free re-roll (#2)
--
-- Counts how many times a paid generation has been re-rolled, so the server can
-- cap free regenerations at MAX_FREE_REGENS. Incremented via a compare-and-swap
-- UPDATE (WHERE regen_count = <expected>) so concurrent clicks can't over-count.
--
-- Safe to run on an existing table: NOT NULL with a default backfills existing rows.
-- Run this in the Supabase SQL editor.

alter table generations add column if not exists regen_count int not null default 0;
```

- [ ] **Step 2: Add the config constant**

In `frontend/src/lib/config.ts`, after `INVOICE_TTL_MINUTES`, add:

```typescript
// Free whole-thread re-rolls allowed per paid invoice (#2).
export const MAX_FREE_REGENS = Number(process.env.MAX_FREE_REGENS ?? 3);
```

- [ ] **Step 3: Document the column**

In `.claude/docs/data-model.md`, add to the `generations` table a row:
`| `regen_count` | int not null default 0 | free re-rolls used; capped at MAX_FREE_REGENS via CAS |`
and to the Migrations list:
`- `0003_generations_regen_count.sql` — adds `regen_count` (default 0).`

- [ ] **Step 4: Run the suite (no behavior change yet)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/supabase/migrations/0003_generations_regen_count.sql frontend/src/lib/config.ts .claude/docs/data-model.md
git commit -m "feat(db): add generations.regen_count + MAX_FREE_REGENS"
```

---

### Task 2: `regenerateGeneration` CAS helper

**Files:**
- Modify: `frontend/src/lib/invoices.ts`

The DB call can't run in a unit test; it is covered via the route test in Task 3. This task just adds the helper and extends the type.

- [ ] **Step 1: Extend the `Generation` type**

In `frontend/src/lib/invoices.ts`, add to the `Generation` type after `thread_content`:

```typescript
  regen_count?: number;
```

- [ ] **Step 2: Add the CAS helper**

After `saveGenerationAndConsume`, add:

```typescript
// Compare-and-swap re-roll: overwrite the thread and bump regen_count only if the
// row still has the regen_count we read (expectedCount). A concurrent re-roll that
// already bumped the counter makes this match zero rows → returns null (caller treats
// it as "in progress / retry"), so two clicks can never over-count or clobber.
export async function regenerateGeneration(
  invoiceId: string, newThread: string[], expectedCount: number,
): Promise<Generation | null> {
  const { data, error } = await supabase
    .from('generations')
    .update({ thread_content: newThread, regen_count: expectedCount + 1 })
    .eq('invoice_id', invoiceId)
    .eq('regen_count', expectedCount)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`regenerateGeneration: ${error.message}`);
  return data;
}
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: PASS (no caller yet; type field is optional).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/invoices.ts
git commit -m "feat(invoices): add regenerateGeneration CAS helper"
```

---

### Task 3: `POST /api/regenerate` route

**Files:**
- Create: `frontend/src/app/api/regenerate/route.ts`
- Create: `frontend/src/app/api/regenerate/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/regenerate/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/invoices', () => ({
  getInvoice: vi.fn(),
  getGeneration: vi.fn(),
  regenerateGeneration: vi.fn(),
}));
vi.mock('@/lib/generate-thread', () => ({ generateThread: vi.fn() }));
vi.mock('@/lib/env', () => ({ assertServerEnv: vi.fn() }));

import { POST } from '../route';
import * as invoices from '@/lib/invoices';
import { generateThread } from '@/lib/generate-thread';

const m = vi.mocked;
const INVOICE_ID = 'a'.repeat(64);

function req(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

function consumedInvoice(overrides: Partial<invoices.Invoice> = {}): invoices.Invoice {
  return {
    invoice_id: INVOICE_ID, topic: 'bitcoin layer 2', tone: 'educational', length: 5,
    price_stx: 100000, price_sbtc: 100, status: 'consumed',
    expires_at: new Date().toISOString(), ...overrides,
  };
}

function gen(overrides: Partial<invoices.Generation> = {}): invoices.Generation {
  return {
    invoice_id: INVOICE_ID, payer_address: 'ST1PAYER', token: 'STX', amount: 100000,
    tx_id: 'tx', thread_content: ['old1', 'old2'], regen_count: 0, ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /api/regenerate', () => {
  it('400 when invoiceId is missing', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('404 when there is no generation to re-roll', async () => {
    m(invoices.getInvoice).mockResolvedValue(consumedInvoice());
    m(invoices.getGeneration).mockResolvedValue(null);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(404);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('409 when the invoice is not consumed', async () => {
    m(invoices.getInvoice).mockResolvedValue(consumedInvoice({ status: 'pending' }));
    m(invoices.getGeneration).mockResolvedValue(gen());
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(409);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('429 when the free re-roll limit is reached', async () => {
    m(invoices.getInvoice).mockResolvedValue(consumedInvoice());
    m(invoices.getGeneration).mockResolvedValue(gen({ regen_count: 3 }));
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(429);
    expect((await res.json()).regenRemaining).toBe(0);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('happy path: re-rolls, returns new thread + remaining count', async () => {
    m(invoices.getInvoice).mockResolvedValue(consumedInvoice());
    m(invoices.getGeneration).mockResolvedValue(gen({ regen_count: 0 }));
    m(generateThread).mockResolvedValue(['new1', 'new2']);
    m(invoices.regenerateGeneration).mockResolvedValue(gen({ thread_content: ['new1', 'new2'], regen_count: 1 }));
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.thread).toEqual(['new1', 'new2']);
    expect(json.regenRemaining).toBe(2); // 3 - 1
    expect(generateThread).toHaveBeenCalledWith('bitcoin layer 2', 'educational', 5);
    expect(invoices.regenerateGeneration).toHaveBeenCalledWith(INVOICE_ID, ['new1', 'new2'], 0);
  });

  it('CAS miss (concurrent re-roll) -> 202, no double count', async () => {
    m(invoices.getInvoice).mockResolvedValue(consumedInvoice());
    m(invoices.getGeneration).mockResolvedValue(gen({ regen_count: 0 }));
    m(generateThread).mockResolvedValue(['new1', 'new2']);
    m(invoices.regenerateGeneration).mockResolvedValue(null); // lost the CAS
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(202);
  });

  it('LLM failure -> 500, regen_count not touched', async () => {
    m(invoices.getInvoice).mockResolvedValue(consumedInvoice());
    m(invoices.getGeneration).mockResolvedValue(gen({ regen_count: 0 }));
    m(generateThread).mockRejectedValue(new Error('llm down'));
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(500);
    expect(invoices.regenerateGeneration).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- regenerate`
Expected: FAIL — `../route` does not exist.

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/regenerate/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, getGeneration, regenerateGeneration } from '@/lib/invoices';
import { generateThread } from '@/lib/generate-thread';
import { assertServerEnv } from '@/lib/env';
import { MAX_FREE_REGENS, type Tone } from '@/lib/config';

export async function POST(req: NextRequest) {
  try {
    assertServerEnv();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'server misconfigured' },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => null);
  const invoiceId = body && typeof body.invoiceId === 'string' ? body.invoiceId : '';
  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
  }

  try {
    const invoice = await getInvoice(invoiceId);
    const generation = await getGeneration(invoiceId);
    // A re-roll only makes sense once a thread has been paid for and produced.
    if (!invoice || !generation) {
      return NextResponse.json({ error: 'nothing to regenerate' }, { status: 404 });
    }
    if (invoice.status !== 'consumed') {
      return NextResponse.json({ error: 'invoice not consumed yet' }, { status: 409 });
    }

    const used = generation.regen_count ?? 0;
    if (used >= MAX_FREE_REGENS) {
      return NextResponse.json(
        { error: 'free re-roll limit reached', regenRemaining: 0 },
        { status: 429 },
      );
    }

    // Generate BEFORE touching the counter: if the LLM fails the user keeps their
    // remaining free re-rolls and the existing thread stays intact.
    let thread: string[];
    try {
      thread = await generateThread(invoice.topic, invoice.tone as Tone, invoice.length);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'generation failed';
      return NextResponse.json({ error: `re-roll failed: ${message}` }, { status: 500 });
    }

    // Compare-and-swap on the count we read: a concurrent re-roll that already bumped
    // it makes this return null → tell the client to retry; never double-count.
    const updated = await regenerateGeneration(invoiceId, thread, used);
    if (!updated) {
      return NextResponse.json({ error: 'another re-roll is in progress, retry' }, { status: 202 });
    }

    return NextResponse.json({
      thread: updated.thread_content,
      regenRemaining: Math.max(0, MAX_FREE_REGENS - (updated.regen_count ?? used + 1)),
    });
  } catch (e) {
    console.error('[regenerate] unhandled error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'internal server error' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- regenerate`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/regenerate/route.ts frontend/src/app/api/regenerate/__tests__/route.test.ts
git commit -m "feat(api): POST /api/regenerate free whole-thread re-roll"
```

---

### Task 4: UI — Regenerate button + remaining counter

**Files:**
- Modify: `frontend/src/app/page.tsx`

No automated UI test; verify with `npm run build` and manual check.

- [ ] **Step 1: Add state and a handler**

In `frontend/src/app/page.tsx`, add state near the other `useState` calls:

```typescript
  const [regenRemaining, setRegenRemaining] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);
```

Import `MAX_FREE_REGENS` for the initial display — add to the existing config-less imports a new line:

```typescript
import { MAX_FREE_REGENS } from '@/lib/config';
```

When a fresh thread is produced in `redeem` (right after `setThread(data.thread);`), seed the counter:

```typescript
      setRegenRemaining(MAX_FREE_REGENS);
```

Add the handler (place it next to `redeem`):

```typescript
  async function regenerate() {
    if (!pendingInvoiceIdForRegen) return;
    setRegenerating(true);
    setError(undefined);
    try {
      const res = await fetch('/api/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: pendingInvoiceIdForRegen }),
      });
      if (res.status === 202) {
        message.info('A re-roll is already in progress — try again in a moment.');
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setThread(data.thread);
      setRegenRemaining(data.regenRemaining);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Re-roll failed');
    } finally {
      setRegenerating(false);
    }
  }
```

We need the invoice id of the currently displayed thread. Add state `const [displayedInvoiceId, setDisplayedInvoiceId] = useState<string>();` and rename the handler's reference: replace `pendingInvoiceIdForRegen` with `displayedInvoiceId` in the handler above. Set it in `redeem` right after `setThread(data.thread);`: `setDisplayedInvoiceId(invoiceId);` (the `invoiceId` param already exists in `redeem`). Also clear it at the top of `handleGenerate` reset: add `setDisplayedInvoiceId(undefined); setRegenRemaining(null);`.

- [ ] **Step 2: Render the button in the "Your thread" header**

In `page.tsx`, inside the `<Flex justify="space-between" align="center" className="tp-rise">` header of the thread block (next to the existing "Copy all" button), wrap the right side so both buttons sit together. Replace the single `<Button ... >Copy all</Button>` with:

```tsx
            <Flex gap={8} align="center">
              {regenRemaining != null && (
                <Button
                  type="text"
                  size="small"
                  loading={regenerating}
                  disabled={regenRemaining === 0 || regenerating}
                  onClick={regenerate}
                  style={{ color: regenRemaining === 0 ? '#6b74a0' : '#9fa8d4' }}
                >
                  {regenRemaining === 0 ? 'No free re-rolls left' : `Regenerate (${regenRemaining} free)`}
                </Button>
              )}
              <Button
                type="text"
                size="small"
                icon={copiedAll ? <CheckOutlined /> : <CopyOutlined />}
                style={{ color: copiedAll ? '#7bc67e' : '#9fa8d4' }}
                onClick={() => {
                  navigator.clipboard.writeText(thread.join('\n\n'));
                  message.success('Whole thread copied');
                  setCopiedAll(true);
                  setTimeout(() => setCopiedAll(false), 1400);
                }}
              >
                {copiedAll ? 'Copied' : 'Copy all'}
              </Button>
            </Flex>
```

Note: when a thread is opened from history (`onSelect` in the `HistoryPanel`), `regenRemaining` stays null so no re-roll button shows (history items have no live invoice id in state) — acceptable for v1.

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat(ui): regenerate button with remaining free-reroll counter"
```

---

## Self-review notes

- Spec coverage: migration + config (T1), CAS helper (T2), route with all error branches incl. 429/202/500 + count-after-success (T3), UI button + counter (T4) — all spec sections covered.
- Error handling matches spec: not-consumed → 409, no generation → 404, limit → 429 (regenRemaining 0), LLM failure → 500 without incrementing, CAS miss → 202.
- Type consistency: `regenerateGeneration(invoiceId, newThread, expectedCount)` and `Generation.regen_count` used identically across T2, T3.
- v1 gate is knowledge of `invoiceId` + N-limit (no session) per the approved spec.
