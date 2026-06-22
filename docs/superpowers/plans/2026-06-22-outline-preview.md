# Outline Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a free, binding outline (one title per tweet) alongside the hook before payment, for x-thread and repurpose-thread.

**Architecture:** A single quote-time LLM call produces `{ hook, outline[] }`. The outline is stored on the invoice and returned in the 402, rendered as a locked list. After payment, the outline is passed into thread generation as the skeleton so the paid tweets follow the previewed points.

**Tech Stack:** Next.js (App Router, webpack), TypeScript, Vitest, Ant Design, Supabase (Postgres), pluggable LLM (Groq default).

## Global Constraints

- **Webpack only** — never touch the `--webpack` flags on dev/build.
- **LLM is pluggable, not Claude** — go through `resolveLlmConfig`/`callLlm`; never add `@anthropic-ai/sdk`.
- **`SUPABASE_SERVICE_ROLE_KEY` / `lib/supabase.ts` are server-only** — never import into a client component.
- **The on-chain receipt is the source of truth for payment** — this feature touches preview only; do not alter payment gating.
- **Commit directly on `main`** (solo project); commit messages **omit** any `Co-Authored-By: Claude` trailer.
- **Smallest task granularity, commit per task.**
- Run tests from `frontend/`: `npm test` (vitest). Migrations live in `frontend/supabase/migrations/` and are applied manually in Supabase.

## File Structure

- `src/lib/generate-thread.ts` — add `parseHookAndOutline`, `buildThreadPrompt` (extracted, pure), `generateHookAndOutline`; extend `generateThread` to use `buildThreadPrompt`.
- `src/lib/services/types.ts` — add `PreviewResult`; change `generatePreview` return type; add `previewOutline` to `GenCtx`.
- `src/lib/services/x-thread.ts` — `generatePreview` → `generateHookAndOutline`; `generate` forwards outline.
- `src/lib/services/repurpose-thread.ts` — `generatePreview` returns `{hook,outline}`; `buildRepurposeSystem` gains outline; `generate` forwards outline.
- `src/lib/services/hot-takes.ts` — `generatePreview` returns `{ hook, outline: null }`.
- `src/lib/invoices.ts` — `Invoice.preview_outline`; `createInvoice` writes it.
- `frontend/supabase/migrations/0008_invoices_preview_outline.sql` — new column.
- `src/app/api/generate/route.ts` — quote stores+returns `previewOutline`; generate builds ctx with it.
- `src/components/OutlinePreview.tsx` — new locked-outline component.
- `src/app/page.tsx` — `Quote` type + state + render `OutlinePreview`.

---

### Task 1: `parseHookAndOutline` parser

**Files:**
- Modify: `src/lib/generate-thread.ts` (add export near `parseHook`, ~line 223)
- Test: `src/lib/__tests__/generate-thread.test.ts`

**Interfaces:**
- Produces: `parseHookAndOutline(raw: string, length: number): { hook: string; outline: string[] }` — tolerant of code fences; trims the outline to at most `length` items; throws on missing hook or unparseable output.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/__tests__/generate-thread.test.ts`:

```ts
import { parseHookAndOutline } from '../generate-thread';

describe('parseHookAndOutline', () => {
  it('parses a hook + outline object', () => {
    const raw = '{"hook":"Why X breaks","outline":["The problem","A cause","The fix"]}';
    expect(parseHookAndOutline(raw, 3)).toEqual({
      hook: 'Why X breaks',
      outline: ['The problem', 'A cause', 'The fix'],
    });
  });

  it('strips code fences before parsing', () => {
    const raw = '```json\n{"hook":"H","outline":["a","b"]}\n```';
    expect(parseHookAndOutline(raw, 2).outline).toEqual(['a', 'b']);
  });

  it('trims a too-long outline down to length', () => {
    const raw = '{"hook":"H","outline":["1","2","3","4","5"]}';
    expect(parseHookAndOutline(raw, 3).outline).toEqual(['1', '2', '3']);
  });

  it('keeps a short outline as-is (no empty padding)', () => {
    const raw = '{"hook":"H","outline":["only one"]}';
    expect(parseHookAndOutline(raw, 5).outline).toEqual(['only one']);
  });

  it('drops non-string and blank outline items', () => {
    const raw = '{"hook":"H","outline":["keep", 7, "  ", "also"]}';
    expect(parseHookAndOutline(raw, 5).outline).toEqual(['keep', 'also']);
  });

  it('throws when the hook is missing', () => {
    expect(() => parseHookAndOutline('{"outline":["a"]}', 3)).toThrow();
  });

  it('throws on unparseable output', () => {
    expect(() => parseHookAndOutline('not json at all', 3)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- generate-thread`
Expected: FAIL — `parseHookAndOutline is not a function` / not exported.

- [ ] **Step 3: Implement `parseHookAndOutline`**

Add to `src/lib/generate-thread.ts` immediately after `parseHook` (it reuses the module-private `extractJsonSlice`):

```ts
// Parse a hook + outline object for the pre-payment preview. Accepts
// {"hook"|"tweet": "...", "outline": ["...", ...]}, tolerant of code fences.
// The outline is trimmed to at most `length` items; short outlines are kept
// as-is (no empty padding — the UI renders only the rows that exist).
export function parseHookAndOutline(
  raw: string, length: number,
): { hook: string; outline: string[] } {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const slice = extractJsonSlice(cleaned);
    if (slice === null) throw new Error('LLM output is not valid JSON');
    parsed = JSON.parse(slice);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LLM output is not a hook+outline object');
  }
  const obj = parsed as Record<string, unknown>;
  const rawHook = typeof obj.hook === 'string' ? obj.hook
    : typeof obj.tweet === 'string' ? obj.tweet : '';
  const hook = rawHook.trim();
  if (!hook) throw new Error('LLM output is missing a usable hook');
  const items = (Array.isArray(obj.outline) ? obj.outline : [])
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, length);
  const cappedHook = hook.length > 280 ? `${hook.slice(0, 277)}...` : hook;
  return { hook: cappedHook, outline: items };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- generate-thread`
Expected: PASS (all `parseHookAndOutline` cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/generate-thread.ts src/lib/__tests__/generate-thread.test.ts
git commit -m "feat(llm): parseHookAndOutline parser for preview"
```

---

### Task 2: Extract `buildThreadPrompt` + outline support

**Files:**
- Modify: `src/lib/generate-thread.ts:272-297` (`generateThread`)
- Test: `src/lib/__tests__/generate-thread.test.ts`

**Interfaces:**
- Produces: `buildThreadPrompt(topic: string, tone: Tone, length: number, opts?: { firstTweet?: string | null; language?: string | null; outline?: string[] | null }): { system: string; user: string }` — pure prompt builder. When `firstTweet` is set, the outline points used are `outline.slice(1)` (tweet 1 = the hook).
- `generateThread` keeps its existing signature plus `opts.outline?: string[] | null` and delegates prompt construction to `buildThreadPrompt`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/__tests__/generate-thread.test.ts`:

```ts
import { buildThreadPrompt } from '../generate-thread';

describe('buildThreadPrompt', () => {
  it('builds a from-scratch prompt with no outline', () => {
    const { system, user } = buildThreadPrompt('AI agents', 'educational', 8);
    expect(system).toContain('Tweet 1 must be a strong hook.');
    expect(system).not.toContain('Follow the given outline');
    expect(user).toContain('Topic: AI agents');
    expect(user).toContain('Number of tweets: 8');
    expect(user).not.toContain('Outline');
  });

  it('embeds the outline and the follow-outline instruction', () => {
    const { system, user } = buildThreadPrompt('AI agents', 'educational', 3, {
      outline: ['Point A', 'Point B', 'Point C'],
    });
    expect(system).toContain('Follow the given outline');
    expect(user).toContain('1. Point A');
    expect(user).toContain('3. Point C');
  });

  it('with a given firstTweet, lists the outline minus its first point', () => {
    const { system, user } = buildThreadPrompt('AI agents', 'educational', 3, {
      firstTweet: 'My hook',
      outline: ['Hook point', 'Point B', 'Point C'],
    });
    expect(system).toContain('Tweet 1 is already written');
    expect(user).toContain('Tweet 1 (already written): My hook');
    expect(user).toContain('Number of additional tweets to write: 2');
    expect(user).toContain('1. Point B');
    expect(user).toContain('2. Point C');
    expect(user).not.toContain('Hook point');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- generate-thread`
Expected: FAIL — `buildThreadPrompt is not a function`.

- [ ] **Step 3: Extract and extend**

In `src/lib/generate-thread.ts`, replace the body of `generateThread` (lines 272-297) with a thin wrapper and add the pure builder above it:

```ts
export function buildThreadPrompt(
  topic: string, tone: Tone, length: number,
  opts?: { firstTweet?: string | null; language?: string | null; outline?: string[] | null },
): { system: string; user: string } {
  const firstTweet = opts?.firstTweet && opts.firstTweet.trim() !== '' ? opts.firstTweet : null;
  const wanted = firstTweet ? length - 1 : length;
  // Tweet 1 is the hook; the remaining tweets follow the outline minus its first point.
  const full = opts?.outline && opts.outline.length ? opts.outline : null;
  const restOutline = full ? (firstTweet ? full.slice(1) : full) : null;
  const hasOutline = !!(restOutline && restOutline.length);
  const system = [
    'You are an expert X (Twitter) thread writer.',
    'Return ONLY a JSON object of the form {"tweets": ["...", "..."]} — one string per tweet.',
    'No markdown fences, no commentary, no numbering prefixes.',
    'Each tweet must be under 270 characters.',
    firstTweet
      ? 'Tweet 1 is already written (given below). Write ONLY the remaining tweets that continue it; do NOT repeat tweet 1.'
      : 'Tweet 1 must be a strong hook.',
    hasOutline
      ? 'Follow the given outline: write one tweet per outline point, in order, each tweet staying on its point.'
      : '',
    'The last tweet wraps up with a takeaway or CTA.',
    languageInstruction(opts?.language),
  ].filter(Boolean).join(' ');
  const outlineBlock = hasOutline
    ? `\nOutline (one tweet per point, in order):\n${restOutline!.map((o, i) => `${i + 1}. ${o}`).join('\n')}`
    : '';
  const user = firstTweet
    ? `Topic: ${topic}\nTweet 1 (already written): ${firstTweet}\nNumber of additional tweets to write: ${wanted}\nStyle: ${TONE_GUIDE[tone]}${outlineBlock}`
    : `Topic: ${topic}\nNumber of tweets: ${length}\nStyle: ${TONE_GUIDE[tone]}${outlineBlock}`;
  return { system, user };
}

export async function generateThread(
  topic: string, tone: Tone, length: number,
  opts?: { firstTweet?: string | null; language?: string | null; outline?: string[] | null },
): Promise<string[]> {
  const config = resolveLlmConfig(process.env);
  assertApiKey(config);
  const firstTweet = opts?.firstTweet && opts.firstTweet.trim() !== '' ? opts.firstTweet : null;
  const { system, user } = buildThreadPrompt(topic, tone, length, opts);
  const raw = await callLlm(config, system, user);
  const rest = parseThreadJson(raw);
  return assembleThread(firstTweet, rest, length);
}
```

- [ ] **Step 4: Run the full suite to verify no regression**

Run: `npm test`
Expected: PASS — new `buildThreadPrompt` tests pass; all existing tests still green (the no-outline prompt string is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/generate-thread.ts src/lib/__tests__/generate-thread.test.ts
git commit -m "refactor(llm): extract buildThreadPrompt + outline skeleton"
```

---

### Task 3: `buildRepurposeSystem` outline support

**Files:**
- Modify: `src/lib/services/repurpose-thread.ts:9-19` (`buildRepurposeSystem`)
- Test: `src/lib/services/__tests__/repurpose-thread.test.ts`

**Interfaces:**
- Produces: `buildRepurposeSystem(length: number, language: LanguageCode, outline?: string[] | null): string` — appends a follow-outline instruction when `outline` is non-empty.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/services/__tests__/repurpose-thread.test.ts` (import `buildRepurposeSystem` if not already imported):

```ts
import { buildRepurposeSystem } from '../repurpose-thread';

describe('buildRepurposeSystem outline', () => {
  it('omits the outline instruction when none is given', () => {
    expect(buildRepurposeSystem(8, 'en')).not.toContain('Follow this outline');
  });

  it('appends the outline points in order when given', () => {
    const s = buildRepurposeSystem(8, 'en', ['First point', 'Second point']);
    expect(s).toContain('Follow this outline');
    expect(s).toContain('1. First point');
    expect(s).toContain('2. Second point');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- repurpose-thread`
Expected: FAIL — current `buildRepurposeSystem` takes two args / no outline text.

- [ ] **Step 3: Implement**

Replace `buildRepurposeSystem` in `src/lib/services/repurpose-thread.ts`:

```ts
export function buildRepurposeSystem(
  length: number, language: LanguageCode, outline?: string[] | null,
): string {
  const parts = [
    'You are an expert X (Twitter) thread writer.',
    'You are given a long source text. Distill it into a thread that captures its key points.',
    'Return ONLY a JSON object of the form {"tweets": ["...", "..."]} — one string per tweet.',
    'No markdown fences, no commentary, no numbering prefixes.',
    'Tweet 1 must be a strong hook. The last tweet wraps up with a takeaway or CTA.',
    `Write about ${length} tweets. Each tweet must be under 270 characters.`,
  ];
  if (outline && outline.length) {
    parts.push(
      `Follow this outline, one tweet per point in order: ${outline.map((o, i) => `${i + 1}. ${o}`).join(' ')}.`,
    );
  }
  parts.push(languageInstruction(language));
  return parts.join(' ');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- repurpose-thread`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/repurpose-thread.ts src/lib/services/__tests__/repurpose-thread.test.ts
git commit -m "feat(repurpose): buildRepurposeSystem follows an outline"
```

---

### Task 4: ServiceDef preview interface + wire all services

**Files:**
- Modify: `src/lib/services/types.ts` (add `PreviewResult`, change `generatePreview`, extend `GenCtx`)
- Modify: `src/lib/generate-thread.ts` (add `generateHookAndOutline`)
- Modify: `src/lib/services/x-thread.ts`, `src/lib/services/repurpose-thread.ts`, `src/lib/services/hot-takes.ts`
- Modify: `src/app/api/generate/__tests__/route.test.ts:15` (add `generateHookAndOutline` to the generate-thread mock)
- Test: existing service tests + `tsc`

**Interfaces:**
- Produces: `type PreviewResult = { hook: string | null; outline: string[] | null }`.
- `GenCtx = { previewHook: string | null; previewOutline: string[] | null }`.
- `ServiceDef.generatePreview(p: P): Promise<PreviewResult>`.
- `generateHookAndOutline(topic: string, tone: Tone, length: number, language?: string | null): Promise<{ hook: string; outline: string[] }>`.
- Consumes: `parseHookAndOutline` (Task 1), `buildThreadPrompt`/`generateThread` outline (Task 2), `buildRepurposeSystem` outline (Task 3).

- [ ] **Step 1: Update the type definitions**

In `src/lib/services/types.ts`:

```ts
export type GenCtx = { previewHook: string | null; previewOutline: string[] | null };
export type PreviewResult = { hook: string | null; outline: string[] | null };
```

And change the `ServiceDef` member:

```ts
  generatePreview(p: P): Promise<PreviewResult>;
```

- [ ] **Step 2: Add `generateHookAndOutline`**

In `src/lib/generate-thread.ts`, after `generateHook` (~line 239):

```ts
// One LLM call producing the opening hook plus a short outline (one title per
// tweet). Used at quote time to power the pre-payment preview.
export async function generateHookAndOutline(
  topic: string, tone: Tone, length: number, language?: string | null,
): Promise<{ hook: string; outline: string[] }> {
  const config = resolveLlmConfig(process.env);
  assertApiKey(config);
  const system = [
    'You are an expert X (Twitter) thread writer.',
    `Return ONLY a JSON object of the form {"hook": "...", "outline": ["...", "..."]} for a ${length}-tweet thread.`,
    'hook is the opening tweet — under 270 characters, scroll-stopping.',
    `outline has ${length} short titles (max 8 words each), one per tweet in order; outline[0] summarizes the hook.`,
    'No markdown fences, no commentary, no numbering prefixes.',
    languageInstruction(language),
  ].join(' ');
  const user = `Topic: ${topic}\nStyle: ${TONE_GUIDE[tone]}`;
  return parseHookAndOutline(await callLlm(config, system, user), length);
}
```

- [ ] **Step 3: Wire x-thread**

In `src/lib/services/x-thread.ts`: import `generateHookAndOutline` (replace the `generateHook` import) and `type PreviewResult`, then replace the `generatePreview`/`generate` members:

```ts
  generatePreview: async (p): Promise<PreviewResult> => {
    const r = await generateHookAndOutline(p.topic, p.tone, p.length, p.language);
    return { hook: r.hook, outline: r.outline };
  },
  generate: (p, ctx: GenCtx) =>
    generateThread(p.topic, p.tone, p.length,
      { firstTweet: ctx.previewHook, language: p.language, outline: ctx.previewOutline }),
```

(Imports: `import { generateThread, generateHookAndOutline, regenerateTweet } from '@/lib/generate-thread';` and add `PreviewResult` to the `./types` import.)

- [ ] **Step 4: Wire repurpose-thread**

In `src/lib/services/repurpose-thread.ts`: add `parseHookAndOutline` to the `@/lib/generate-thread` import and `PreviewResult` to `./types`. Replace `generatePreview` and the `system` line of `generate`:

```ts
async function generate(p: RepurposeParams, ctx: GenCtx): Promise<string[]> {
  const config = resolveLlmConfig(process.env);
  assertApiKey(config);
  const head = ctx.previewHook && ctx.previewHook.trim() !== '' ? [ctx.previewHook] : [];
  const want = head.length ? p.length - 1 : p.length;
  const restOutline = ctx.previewOutline ? ctx.previewOutline.slice(head.length) : null;
  const system = buildRepurposeSystem(want, p.language, restOutline);
  const user = `Source text:\n${p.sourceText}\nStyle: ${TONE_GUIDE[p.tone]}`;
  const rest = parseThreadJson(await callLlm(config, system, user));
  return [...head, ...rest].slice(0, p.length);
}

async function generatePreview(p: RepurposeParams): Promise<PreviewResult> {
  const config = resolveLlmConfig(process.env);
  assertApiKey(config);
  const system = [
    'You are an expert X (Twitter) thread writer.',
    `Read the source text and return ONLY {"hook":"...","outline":["...","..."]} for a ${p.length}-tweet thread that distills it.`,
    'hook is the opening tweet, under 270 characters.',
    `outline has ${p.length} short titles (max 8 words each), one per tweet in order; outline[0] summarizes the hook.`,
    'No fences, no commentary.',
    languageInstruction(p.language),
  ].join(' ');
  const r = parseHookAndOutline(
    await callLlm(config, system, `Source text:\n${p.sourceText}\nStyle: ${TONE_GUIDE[p.tone]}`),
    p.length,
  );
  return { hook: r.hook, outline: r.outline };
}
```

- [ ] **Step 5: Wire hot-takes (out of scope → null outline)**

In `src/lib/services/hot-takes.ts`: add `PreviewResult` to the `./types` import and change `generatePreview` to wrap its hook:

```ts
async function generatePreview(p: HotTakesParams): Promise<PreviewResult> {
  const config = resolveLlmConfig(process.env);
  assertApiKey(config);
  const system = [
    'You are a sharp X (Twitter) writer known for bold takes.',
    'Return ONLY {"tweet": "..."} — a single standalone hot take on the topic. Under 270 characters. No fences.',
    languageInstruction(p.language),
  ].join(' ');
  const hook = parseHook(await callLlm(config, system, `Topic: ${p.topic}\nStyle: ${TONE_GUIDE[p.tone]}`));
  return { hook, outline: null };
}
```

- [ ] **Step 6: Keep the route test mock compiling**

In `src/app/api/generate/__tests__/route.test.ts`, line 15, add `generateHookAndOutline` to the mock:

```ts
vi.mock('@/lib/generate-thread', () => ({ generateThread: vi.fn(), generateHook: vi.fn(), generateHookAndOutline: vi.fn() }));
```

- [ ] **Step 7: Typecheck + run the suite**

Run: `npx tsc --noEmit 2>&1 | grep -E "services|generate-thread" || echo "clean"`
Expected: `clean` (no new type errors in these files; pre-existing `Generation.service_id` test errors are unrelated).
Run: `npm test -- services`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/services/types.ts src/lib/generate-thread.ts src/lib/services/x-thread.ts src/lib/services/repurpose-thread.ts src/lib/services/hot-takes.ts src/app/api/generate/__tests__/route.test.ts
git commit -m "feat(services): generatePreview returns hook+outline; bind outline to generation"
```

---

### Task 5: Persist `preview_outline`

**Files:**
- Create: `frontend/supabase/migrations/0008_invoices_preview_outline.sql`
- Modify: `src/lib/invoices.ts:5-19` (`Invoice` type) and `createInvoice` (~line 33-52)

**Interfaces:**
- Produces: `Invoice.preview_outline?: string[] | null`; `createInvoice` accepts `previewOutline?: string[] | null` and writes it.

- [ ] **Step 1: Write the migration**

Create `frontend/supabase/migrations/0008_invoices_preview_outline.sql`:

```sql
-- Outline preview: a short title per tweet, shown (locked) before payment and
-- used as the skeleton for the paid generation. Nullable — services without an
-- outline (hot-takes) and degraded quotes leave it null.
alter table invoices add column if not exists preview_outline jsonb;
```

- [ ] **Step 2: Extend the `Invoice` type and `createInvoice`**

In `src/lib/invoices.ts`, add to the `Invoice` type (after `preview_hook`):

```ts
  preview_outline?: string[] | null;
```

In `createInvoice`, add `previewOutline?: string[] | null;` to the args object type and set it on the inserted invoice:

```ts
    preview_hook: args.previewHook ?? null,
    preview_outline: args.previewOutline ?? null,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep invoices.ts || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add frontend/supabase/migrations/0008_invoices_preview_outline.sql src/lib/invoices.ts
git commit -m "feat(invoices): persist preview_outline (migration 0008)"
```

> **Note for the human:** apply `0008_invoices_preview_outline.sql` in Supabase before testing the live flow.

---

### Task 6: Route — store, return, and consume the outline

**Files:**
- Modify: `src/app/api/generate/route.ts:54-74` (quote branch) and `:135` (generate ctx)
- Test: `src/app/api/generate/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `PreviewResult` (Task 4), `createInvoice` `previewOutline` (Task 5), `Invoice.preview_outline` (Task 5).
- Produces: 402 body field `previewOutline: string[] | null`; generate ctx `{ previewHook, previewOutline }`.

- [ ] **Step 1: Write the failing test**

Add to the "quote (branch 1)" describe block in `route.test.ts` (uses the `generateHookAndOutline` mock added in Task 4 — import it):

```ts
import { generateHookAndOutline } from '@/lib/generate-thread';

it('returns previewOutline in the 402 body', async () => {
  m(invoices.createInvoice).mockResolvedValue(baseInvoice({ preview_outline: ['a', 'b', 'c'] }));
  m(generateHookAndOutline).mockResolvedValue({ hook: 'H', outline: ['a', 'b', 'c'] });
  const res = await POST(req({ service: 'x-thread', params: { topic: 'AI', tone: 'educational', length: 5 } }));
  expect(res.status).toBe(402);
  const json = await res.json();
  expect(json.previewOutline).toEqual(['a', 'b', 'c']);
  expect(json.previewHook).toBe('H');
});

it('degrades to a null outline when preview generation throws', async () => {
  m(invoices.createInvoice).mockResolvedValue(baseInvoice());
  m(generateHookAndOutline).mockRejectedValue(new Error('llm down'));
  const res = await POST(req({ service: 'x-thread', params: { topic: 'AI', tone: 'educational', length: 5 } }));
  expect(res.status).toBe(402);
  const json = await res.json();
  expect(json.previewOutline ?? null).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- route`
Expected: FAIL — `previewOutline` absent from the body.

- [ ] **Step 3: Update the quote branch**

In `src/app/api/generate/route.ts`, import the type: add `import type { PreviewResult } from '@/lib/services/types';` near the registry import. Replace lines ~54-74 (the preview-hook + createInvoice + 402 return) with:

```ts
    // Free preview: hook + binding outline. Degrade gracefully — never block the quote.
    let preview: PreviewResult = { hook: null, outline: null };
    try {
      preview = await def.generatePreview(v.params);
    } catch (e) {
      log.warn('generate.preview_failed', { err: e });
    }
    const invoice = await createInvoice({
      serviceId: def.id, params: v.params as Record<string, unknown>,
      priceStx: def.priceStx, priceSbtc: def.priceSbtc,
      previewHook: preview.hook, previewOutline: preview.outline,
    });
    return NextResponse.json({
      invoiceId: invoice.invoice_id,
      service: def.id,
      priceStx: invoice.price_stx,
      priceSbtc: invoice.price_sbtc,
      contract: CONTRACT,
      sbtcContract: SBTC_CONTRACT,
      expiresAt: invoice.expires_at,
      previewHook: preview.hook,
      previewOutline: preview.outline,
    }, { status: 402 });
```

- [ ] **Step 4: Update the generate ctx**

Replace line ~135:

```ts
    thread = await def.generate(invoice.params ?? {}, {
      previewHook: invoice.preview_hook ?? null,
      previewOutline: invoice.preview_outline ?? null,
    });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- route`
Expected: PASS (new outline tests + existing quote/generate tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/generate/route.ts src/app/api/generate/__tests__/route.test.ts
git commit -m "feat(api): return preview outline in 402, pass it into generation"
```

---

### Task 7: `OutlinePreview` component

> **Test approach:** this repo has no DOM test setup (`@testing-library/react`, jsdom/happy-dom, or a DOM `environment` in vitest are all absent) and no component renders are tested anywhere. Do NOT add those deps. Follow the established pattern: extract the one piece of logic — which rows are locked — into a pure exported helper and unit-test that; leave the JSX as untested thin presentation (as `page.tsx` already is).

**Files:**
- Create: `src/components/OutlinePreview.tsx` (exports the component **and** the pure helper `lockedOutlineRows`)
- Test: `src/components/__tests__/OutlinePreview.test.ts` (`.ts`, no JSX — tests the helper only)

**Interfaces:**
- Produces: `lockedOutlineRows(outline: string[] | null): string[]` — returns `outline.slice(1)` (the rows after the hook) or `[]`.
- Produces: `OutlinePreview({ hook, outline, priceLabel }: { hook: string; outline: string[] | null; priceLabel: string })` — renders the hook clear, the locked rows from `lockedOutlineRows`, and the pay CTA.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/OutlinePreview.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lockedOutlineRows } from '../OutlinePreview';

describe('lockedOutlineRows', () => {
  it('returns the rows after the hook (outline[1..])', () => {
    expect(lockedOutlineRows(['hook pt', 'second', 'third'])).toEqual(['second', 'third']);
  });

  it('returns [] for a null outline', () => {
    expect(lockedOutlineRows(null)).toEqual([]);
  });

  it('returns [] for a hook-only outline', () => {
    expect(lockedOutlineRows(['just the hook'])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- OutlinePreview`
Expected: FAIL — module not found / `lockedOutlineRows` not exported.

- [ ] **Step 3: Implement the component + helper**

Create `src/components/OutlinePreview.tsx` (client component, Ant Design Typography + lock icon, matching the existing `vg-gallery` / `--vg-*` styling from `page.tsx`):

```tsx
'use client';
import { Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

// outline[0] corresponds to the (already-shown) hook; the locked rows are the rest.
export function lockedOutlineRows(outline: string[] | null): string[] {
  return outline ? outline.slice(1) : [];
}

export function OutlinePreview({ hook, outline, priceLabel }: {
  hook: string;
  outline: string[] | null;
  priceLabel: string;
}) {
  const lockedRows = lockedOutlineRows(outline);
  return (
    <div className="tp-rise vg-gallery" style={{ marginTop: 20, padding: 16 }}>
      <Text style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--vg-on-art-faint)', marginBottom: 8 }}>
        Free preview — your hook
      </Text>
      <Paragraph style={{ margin: 0, color: 'var(--vg-on-art)', fontSize: 15 }}>{hook}</Paragraph>

      {lockedRows.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lockedRows.map((title, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.62 }}>
              <LockOutlined style={{ color: 'var(--vg-on-art-faint)' }} />
              <Text style={{ color: 'var(--vg-on-art-soft)', fontSize: 14 }}>{title}</Text>
            </div>
          ))}
        </div>
      )}

      <Text style={{ display: 'block', marginTop: 14, color: 'var(--vg-on-art-soft)', fontSize: 13 }}>
        Pay {priceLabel} to unlock the full thread.
      </Text>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- OutlinePreview`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/OutlinePreview.tsx src/components/__tests__/OutlinePreview.test.ts
git commit -m "feat(ui): OutlinePreview locked-outline component"
```

---

### Task 8: Wire `OutlinePreview` into the page

**Files:**
- Modify: `src/app/page.tsx` — `Quote` type (line ~24), `previewOutline` state (near line ~42 / ~211-214), and the preview block (lines ~319-330)

**Interfaces:**
- Consumes: 402 body `previewOutline` (Task 6), `OutlinePreview` (Task 7).

- [ ] **Step 1: Extend the `Quote` type and state**

In `src/app/page.tsx`, add `previewOutline` to the `Quote` type (line ~24):

```ts
  invoiceId: string; priceStx: number; priceSbtc: number; expiresAt: string; previewHook?: string | null; previewOutline?: string[] | null;
```

Add state next to `previewHook` (line ~42):

```ts
  const [previewOutline, setPreviewOutline] = useState<string[] | null>(null);
```

Reset it where `previewHook` is reset in `handleGenerate` (line ~194, the `setPreviewHook(null)` call) — add `setPreviewOutline(null);` — and set it after the quote (line ~211):

```ts
      setPreviewHook(quote.previewHook ?? null);
      setPreviewOutline(quote.previewOutline ?? null);
```

- [ ] **Step 2: Replace the inline preview block**

Add the import at the top of `page.tsx` with the other component imports:

```ts
import { OutlinePreview } from '@/components/OutlinePreview';
```

Replace the `{/* ── Free hook preview ── */}` block (lines ~319-330) with:

```tsx
      {/* ── Free preview: hook + locked outline ── */}
      {previewHook && thread.length === 0 && (
        <OutlinePreview hook={previewHook} outline={previewOutline} priceLabel={`${displayPrice} STX`} />
      )}
```

> Use the existing price display value the page already computes for the form/quote (search `page.tsx` for the STX price string already shown to the user, e.g. a `priceStx`-derived label, and pass that as `priceLabel`). If no formatted label exists, pass `` `${(quote.priceStx / 1_000_000)} STX` `` computed where the quote is in scope, lifted into state alongside `previewOutline`.

- [ ] **Step 3: Verify build + full suite**

Run: `npm run build` (webpack) and `npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 4: Manual smoke (with migration 0008 applied)**

Run `npm run dev`, request a quote for an x-thread; confirm the hook shows clear and `N-1` locked rows appear with the pay CTA. Pay on testnet and confirm the generated thread follows the previewed outline order.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): show outline preview before payment"
```

---

## Self-Review

**Spec coverage:**
- Outline (not real text), one cheap call → Task 1 (parser), Task 4 (`generateHookAndOutline`, single call). ✓
- Binding outline → Task 2 (`generateThread`/`buildThreadPrompt`), Task 3 (`buildRepurposeSystem`), Task 4 (services forward `ctx.previewOutline`). ✓
- Scope x-thread + repurpose; hot-takes null → Task 4 (hot-takes returns `{hook, outline:null}`). ✓
- One LLM call (hook+outline together) → Task 4. ✓
- Persistence (`preview_outline` jsonb, migration) → Task 5. ✓
- Route store/return/consume + graceful degrade → Task 6. ✓
- UI locked list + hook-only fallback → Tasks 7-8. ✓
- Testing matrix (parser, prompt builders, route, component) → Tasks 1,2,3,6,7. ✓

**Placeholder scan:** Two spots intentionally defer to in-file inspection (the route test mock import already exists per Task 4; the `priceLabel` value in Task 8). Both name the exact search to run and a concrete fallback — no blind "TBD".

**Type consistency:** `PreviewResult = { hook: string|null; outline: string[]|null }` defined in Task 4 and consumed identically in Tasks 6/8. `GenCtx.previewOutline: string[]|null` (Task 4) matches route ctx (Task 6) and service `generate` usage. `generateHookAndOutline(...) => { hook: string; outline: string[] }` (Task 4) matches its call sites and the parser return (Task 1). `buildThreadPrompt`/`buildRepurposeSystem` outline params are `string[] | null`. Consistent.
