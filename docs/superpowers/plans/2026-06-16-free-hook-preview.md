# Free Hook Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the first tweet (hook) for free before payment, generated at quote time and reused as tweet #1 of the paid thread.

**Architecture:** `POST /api/generate` branch 1 (quote) gains a single cheap LLM call (`generateHook`) whose result is stored on the invoice (`preview_hook`) and returned in the 402. Branch 2 passes that stored hook to `generateThread` as a pinned tweet #1 so the LLM only writes tweets 2..N. Hook generation degrades gracefully — if it fails, the quote still returns.

**Tech Stack:** Next.js 16 App Router route handlers, Supabase (service-role), Vitest, Ant Design.

Run all `npm` commands from `frontend/`. Tests: `npm test`. Webpack only — never add Turbopack.

---

### Task 1: Migration — `invoices.preview_hook`

**Files:**
- Create: `frontend/supabase/migrations/0002_invoices_preview_hook.sql`
- Modify (docs): `.claude/docs/data-model.md` (Migrations list + invoices table row)

- [ ] **Step 1: Write the migration SQL**

```sql
-- Migration: free hook preview (#1)
--
-- Stores the single-tweet hook generated for free at quote time. It is shown to
-- the user before payment and reused as tweet #1 of the paid thread so the LLM is
-- not paid twice for the hook and the preview stays honest.
--
-- Safe to run on an existing table: column is nullable, no backfill needed.
-- Run this in the Supabase SQL editor.

alter table invoices add column if not exists preview_hook text;
```

- [ ] **Step 2: Document the column**

In `.claude/docs/data-model.md`, add to the `invoices` table a row:
`| `preview_hook` | text null | free single-tweet hook shown pre-payment, reused as tweet #1 |`
and add to the Migrations list:
`- `0002_invoices_preview_hook.sql` — adds the nullable `preview_hook` column.`

- [ ] **Step 3: Commit**

```bash
git add frontend/supabase/migrations/0002_invoices_preview_hook.sql .claude/docs/data-model.md
git commit -m "feat(db): add invoices.preview_hook for free hook preview"
```

---

### Task 2: `generateHook` — single-tweet hook

**Files:**
- Modify: `frontend/src/lib/generate-thread.ts`
- Test: `frontend/src/lib/__tests__/generate-thread.test.ts`

Note: `generateHook` calls the LLM, so the unit test covers the pure helper it relies on. We test the prompt-independent contract via `parseThreadJson` (already covered) and add a test that `generateHook` parses a one-tweet response. To keep it a unit test, refactor so the network call is the only impure part: extract a `parseHook(raw)` pure function.

- [ ] **Step 1: Write the failing test for `parseHook`**

Add to `frontend/src/lib/__tests__/generate-thread.test.ts`:

```typescript
import { parseHook } from '../generate-thread';

describe('parseHook', () => {
  it('returns a single string from a JSON array', () => {
    expect(parseHook('["a strong hook"]')).toBe('a strong hook');
  });

  it('returns the string from a {"tweet": "..."} wrapper', () => {
    expect(parseHook('{"tweet":"hooky"}')).toBe('hooky');
  });

  it('returns a bare quoted string', () => {
    expect(parseHook('"just a hook"')).toBe('just a hook');
  });

  it('truncates a hook over 280 chars', () => {
    const long = 'x'.repeat(300);
    expect(parseHook(JSON.stringify([long])).length).toBeLessThanOrEqual(280);
  });

  it('throws when there is no usable string', () => {
    expect(() => parseHook('{"a":1}')).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- generate-thread`
Expected: FAIL — `parseHook` is not exported / not defined.

- [ ] **Step 3: Implement `parseHook` and `generateHook`**

In `frontend/src/lib/generate-thread.ts`, after `parseThreadJson`, add:

```typescript
// Parse a single hook tweet from the LLM. Accepts a JSON array of one string,
// a {"tweet": "..."} / {"hook": "..."} object, or a bare quoted string.
export function parseHook(raw: string): string {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    const slice = extractJsonSlice(cleaned);
    value = slice === null ? cleaned : (() => { try { return JSON.parse(slice); } catch { return cleaned; } })();
  }
  let hook: unknown = value;
  if (Array.isArray(value)) hook = value[0];
  else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    hook = obj.tweet ?? obj.hook ?? Object.values(obj).find((v) => typeof v === 'string');
  }
  if (typeof hook !== 'string' || hook.trim() === '') {
    throw new Error('LLM hook output is not a usable string');
  }
  const trimmed = hook.trim();
  return trimmed.length > 280 ? `${trimmed.slice(0, 277)}...` : trimmed;
}

// One free, cheap LLM call: just the opening hook tweet. Used at quote time.
export async function generateHook(topic: string, tone: Tone): Promise<string> {
  const config = resolveLlmConfig(process.env);
  if (config.provider !== 'ollama' && !config.apiKey) {
    throw new Error(
      `Missing API key for "${config.provider}". Set ${DEFAULTS[config.provider].keyEnv} in .env.local`,
    );
  }
  const system = [
    'You are an expert X (Twitter) thread writer.',
    'Return ONLY a JSON object of the form {"tweet": "..."} — a single opening hook tweet.',
    'No markdown fences, no commentary, no numbering.',
    'The tweet must be under 270 characters and be a strong, scroll-stopping hook.',
    'Write in the same language as the topic given by the user.',
  ].join(' ');
  const user = `Topic: ${topic}\nStyle: ${TONE_GUIDE[tone]}`;
  const raw = await callLlm(config, system, user);
  return parseHook(raw);
}
```

Note: `extractJsonSlice`, `resolveLlmConfig`, `DEFAULTS`, `TONE_GUIDE`, `callLlm` already exist in this file. Move `parseHook` below `extractJsonSlice` so it is in scope.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- generate-thread`
Expected: PASS (all `parseHook` + existing tests green).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/generate-thread.ts frontend/src/lib/__tests__/generate-thread.test.ts
git commit -m "feat(llm): add generateHook + parseHook for free preview"
```

---

### Task 3: `generateThread` accepts a pinned first tweet

**Files:**
- Modify: `frontend/src/lib/generate-thread.ts`
- Test: `frontend/src/lib/__tests__/generate-thread.test.ts`

The network call cannot run in a unit test, so we test the pinning logic by extracting it into a pure, exported helper `assembleThread(firstTweet, rest, length)` and unit-testing that. `generateThread` calls it.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/lib/__tests__/generate-thread.test.ts`:

```typescript
import { assembleThread } from '../generate-thread';

describe('assembleThread', () => {
  it('pins the given first tweet and appends the rest', () => {
    expect(assembleThread('HOOK', ['b', 'c'], 3)).toEqual(['HOOK', 'b', 'c']);
  });

  it('trims to length when the model returns too many', () => {
    expect(assembleThread('HOOK', ['b', 'c', 'd', 'e'], 3)).toEqual(['HOOK', 'b', 'c']);
  });

  it('returns the rest unchanged when no first tweet is pinned', () => {
    expect(assembleThread(null, ['a', 'b'], 5)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- generate-thread`
Expected: FAIL — `assembleThread` not exported.

- [ ] **Step 3: Implement `assembleThread` and wire it into `generateThread`**

In `frontend/src/lib/generate-thread.ts`, add:

```typescript
// Combine an optional pinned first tweet with the model's continuation, capped at
// `length`. When firstTweet is null, the model's array is returned as-is.
export function assembleThread(
  firstTweet: string | null, rest: string[], length: number,
): string[] {
  if (!firstTweet) return rest;
  return [firstTweet, ...rest].slice(0, length);
}
```

Then change the `generateThread` signature and body:

```typescript
export async function generateThread(
  topic: string, tone: Tone, length: number,
  opts?: { firstTweet?: string | null },
): Promise<string[]> {
  const config = resolveLlmConfig(process.env);
  if (config.provider !== 'ollama' && !config.apiKey) {
    throw new Error(
      `Missing API key for "${config.provider}". Set ${DEFAULTS[config.provider].keyEnv} in .env.local`,
    );
  }
  const firstTweet = opts?.firstTweet ?? null;
  const wanted = firstTweet ? length - 1 : length;
  const system = [
    'You are an expert X (Twitter) thread writer.',
    'Return ONLY a JSON object of the form {"tweets": ["...", "..."]} — one string per tweet.',
    'No markdown fences, no commentary, no numbering prefixes.',
    'Each tweet must be under 270 characters.',
    firstTweet
      ? 'Tweet 1 is already written (given below). Write ONLY the remaining tweets that continue it; do NOT repeat tweet 1.'
      : 'Tweet 1 must be a strong hook.',
    'The last tweet wraps up with a takeaway or CTA.',
    'Write in the same language as the topic given by the user.',
  ].join(' ');
  const user = firstTweet
    ? `Topic: ${topic}\nTweet 1 (already written): ${firstTweet}\nNumber of additional tweets to write: ${wanted}\nStyle: ${TONE_GUIDE[tone]}`
    : `Topic: ${topic}\nNumber of tweets: ${length}\nStyle: ${TONE_GUIDE[tone]}`;
  const raw = await callLlm(config, system, user);
  const rest = parseThreadJson(raw);
  return assembleThread(firstTweet, rest, length);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- generate-thread`
Expected: PASS.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS (existing generate-route tests call `generateThread` mocked, so signature change is safe).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/generate-thread.ts frontend/src/lib/__tests__/generate-thread.test.ts
git commit -m "feat(llm): generateThread can pin a preview hook as tweet #1"
```

---

### Task 4: Persist `preview_hook` in `createInvoice`

**Files:**
- Modify: `frontend/src/lib/invoices.ts`

No new unit test (DB call); covered by the route test in Task 5.

- [ ] **Step 1: Add the field to the type and store it**

In `frontend/src/lib/invoices.ts`, add to the `Invoice` type after `generating_at`:

```typescript
  preview_hook?: string | null;
```

Change `createInvoice` signature and body:

```typescript
export async function createInvoice(
  topic: string, tone: string, length: number, previewHook?: string | null,
): Promise<Invoice> {
  const invoice: Invoice = {
    invoice_id: crypto.randomBytes(32).toString('hex'),
    topic, tone, length,
    price_stx: PRICE_STX,
    price_sbtc: PRICE_SBTC,
    status: 'pending',
    expires_at: new Date(Date.now() + INVOICE_TTL_MINUTES * 60_000).toISOString(),
    preview_hook: previewHook ?? null,
  };
  const { error } = await supabase.from('invoices').insert(invoice);
  if (error) throw new Error(`createInvoice: ${error.message}`);
  return invoice;
}
```

- [ ] **Step 2: Run the suite**

Run: `npm test`
Expected: PASS (existing `createInvoice` callers pass no `previewHook`; arg is optional).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/invoices.ts
git commit -m "feat(invoices): store preview_hook on createInvoice"
```

---

### Task 5: Wire the route — generate hook at quote, reuse at redeem

**Files:**
- Modify: `frontend/src/app/api/generate/route.ts`
- Test: `frontend/src/app/api/generate/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

In `frontend/src/app/api/generate/__tests__/route.test.ts`, extend the `generate-thread` mock and add tests. First update the mock at the top of the file:

```typescript
vi.mock('@/lib/generate-thread', () => ({ generateThread: vi.fn(), generateHook: vi.fn() }));
```

Add the import:

```typescript
import { generateThread, generateHook } from '@/lib/generate-thread';
```

Add inside `describe('POST /api/generate — quote (branch 1)', ...)`:

```typescript
  it('returns previewHook in the 402 when the hook generates', async () => {
    m(generateHook).mockResolvedValue('a strong hook');
    m(invoices.createInvoice).mockResolvedValue(baseInvoice({ preview_hook: 'a strong hook' }));
    const res = await POST(req({ topic: 'bitcoin layer 2', tone: 'educational', length: 5 }));
    expect(res.status).toBe(402);
    expect((await res.json()).previewHook).toBe('a strong hook');
    expect(invoices.createInvoice).toHaveBeenCalledWith('bitcoin layer 2', 'educational', 5, 'a strong hook');
  });

  it('still returns a 402 quote when the hook generation fails', async () => {
    m(generateHook).mockRejectedValue(new Error('llm down'));
    m(invoices.createInvoice).mockResolvedValue(baseInvoice({ preview_hook: null }));
    const res = await POST(req({ topic: 'bitcoin layer 2', tone: 'educational', length: 5 }));
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.invoiceId).toBe(INVOICE_ID);
    expect(json.previewHook ?? null).toBeNull();
    expect(invoices.createInvoice).toHaveBeenCalledWith('bitcoin layer 2', 'educational', 5, null);
  });
```

Add inside `describe('POST /api/generate — verify + generate (branch 2)', ...)`:

```typescript
  it('reuses the stored preview_hook as tweet #1 when generating', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice({ preview_hook: 'pinned hook' }));
    m(invoices.isExpired).mockReturnValue(false);
    m(fetchReceipt).mockResolvedValue(stxReceipt);
    m(invoices.claimInvoice).mockResolvedValue(true);
    m(generateThread).mockResolvedValue(['pinned hook', 'b']);
    m(invoices.saveGenerationAndConsume).mockImplementation(async (g) => g);
    await POST(req({ invoiceId: INVOICE_ID, txId: '0xtx' }));
    expect(generateThread).toHaveBeenCalledWith(
      'bitcoin layer 2', 'educational', 5, { firstTweet: 'pinned hook' },
    );
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- generate/__tests__/route`
Expected: FAIL — route does not call `generateHook` / does not pass `firstTweet`.

- [ ] **Step 3: Update the route**

In `frontend/src/app/api/generate/route.ts`:

Change the import line:
```typescript
import { generateThread, generateHook } from '@/lib/generate-thread';
```

Replace branch 1's invoice creation + return (the block currently doing `const invoice = await createInvoice(topic, tone, length);` and returning) with:

```typescript
    // Generate the free preview hook. If it fails, degrade gracefully: still quote.
    let previewHook: string | null = null;
    try {
      previewHook = await generateHook(topic, tone);
    } catch (e) {
      console.warn('[generate] preview hook failed, quoting without it:', e);
    }
    const invoice = await createInvoice(topic, tone, length, previewHook);
    return NextResponse.json({
      invoiceId: invoice.invoice_id,
      priceStx: invoice.price_stx,
      priceSbtc: invoice.price_sbtc,
      contract: CONTRACT,
      sbtcContract: SBTC_CONTRACT,
      expiresAt: invoice.expires_at,
      previewHook,
    }, { status: 402 });
```

In branch 2, change the `generateThread` call:

```typescript
    thread = await generateThread(invoice.topic, invoice.tone as Tone, invoice.length, {
      firstTweet: invoice.preview_hook ?? null,
    });
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- generate/__tests__/route`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/generate/route.ts frontend/src/app/api/generate/__tests__/route.test.ts
git commit -m "feat(api): free hook preview at quote, reuse at redeem"
```

---

### Task 6: UI — show the hook + unlock CTA

**Files:**
- Modify: `frontend/src/app/page.tsx`

No automated UI test (the project has no component tests). Verify by `npm run build` and manual check.

- [ ] **Step 1: Extend the `Quote` type and capture the hook**

In `frontend/src/app/page.tsx`, change the `Quote` type:

```typescript
type Quote = {
  invoiceId: string; priceStx: number; priceSbtc: number; expiresAt: string; previewHook?: string | null;
};
```

Add state near the other `useState` calls:

```typescript
  const [previewHook, setPreviewHook] = useState<string | null>(null);
  const [previewPrice, setPreviewPrice] = useState<number | null>(null);
```

In `handleGenerate`, after `const quote: Quote = await quoteRes.json();`, set the preview before requesting the signature:

```typescript
      setPreviewHook(quote.previewHook ?? null);
      setPreviewPrice(values.token === 'STX' ? quote.priceStx : quote.priceSbtc);
```

In `handleGenerate`'s reset line at the top, also clear the preview:
change `setError(undefined); setThread([]); setTxid(undefined); setPendingInvoiceId(undefined);`
to additionally call `setPreviewHook(null);`.

When the final thread arrives (in `redeem`, on success after `setThread(data.thread)`), clear the preview:
add `setPreviewHook(null);` right after `setThread(data.thread);`.

- [ ] **Step 2: Render the preview block**

In `page.tsx`, just above the `{/* ── Payment status ── */}` block, add:

```tsx
      {/* ── Free hook preview ── */}
      {previewHook && thread.length === 0 && (
        <div className="tp-rise vg-gallery" style={{ marginTop: 20, padding: 16 }}>
          <Text style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8593cf', marginBottom: 8 }}>
            Free preview — your hook
          </Text>
          <Paragraph style={{ margin: 0, color: '#f0eee8', fontSize: 15 }}>{previewHook}</Paragraph>
          <Text style={{ display: 'block', marginTop: 10, color: '#9fb0e0', fontSize: 13 }}>
            {previewPrice != null
              ? `Pay to unlock the full thread.`
              : 'Pay to unlock the full thread.'}
          </Text>
        </div>
      )}
```

(`Text` and `Paragraph` are already destructured from `Typography` at the top of the file.)

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: build succeeds (webpack).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat(ui): show free hook preview with unlock CTA"
```

---

## Self-review notes

- Spec coverage: migration (T1), generateHook (T2), pinned tweet 1 (T3), persist hook (T4), route wiring + graceful degrade + reuse (T5), UI (T6) — all spec sections covered.
- The graceful-degradation requirement (hook failure must not block quoting) is tested in T5 step 1.
- Backwards compatibility (pre-migration invoice with `preview_hook` null) holds: `assembleThread(null, …)` returns the model output unchanged.
