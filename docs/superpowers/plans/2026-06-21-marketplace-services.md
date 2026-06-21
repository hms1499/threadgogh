# Marketplace of AI services (single operator) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the x402 pay-per-generate gate so one operator can offer three content services (`x-thread`, `repurpose-thread`, `hot-takes`) behind the same payment flow, all outputting `string[]` so the existing output UI is reused.

**Architecture:** A server-side service registry (`src/lib/services/`) is the single source of truth. `/api/generate` stays one route and dispatches by `service_id`. Invoices gain `service_id` + `params jsonb`. The on-chain contract is untouched (it is service-agnostic). New non-thread output shapes and multi-tenancy are out of scope.

**Tech Stack:** Next.js 16 (App Router, webpack), React 19, TypeScript 5, Ant Design 6, Vitest 4, Supabase Postgres.

## Global Constraints

- All commands run from `frontend/` (e.g. `cd frontend && npm test`).
- Webpack only — never add/remove the `--webpack` flag on `dev`/`build`.
- Validation is manual allow-list style (e.g. `TONES.includes(...)`). Do NOT add a schema library (zod/yup/etc.).
- Tests are `.test.ts` only under `src/**/__tests__/` (Vitest include `src/**/__tests__/**/*.test.ts`). No component/`.tsx` tests, no testing-library, no jsdom — UI tasks are verified by `npm run build` and noted as manual.
- LLM is pluggable via `LLM_PROVIDER` (default Groq). Never hardwire a provider or add `@anthropic-ai/sdk`.
- The on-chain receipt + stored invoice are the sole source of truth for what was paid; Branch 2 of `/api/generate` must read `service_id`/`params` from the invoice, never the client body.
- Commit directly on `main` (solo project). Commit messages must NOT include a `Co-Authored-By: Claude` trailer.
- Service `string[]` output: every tweet/item capped at 280 chars (existing `parseThreadJson`/`parseHook` already enforce this).
- Default price comes from `PRICE_STX` / `PRICE_SBTC` in `config.ts`.

---

### Task 1: Export reusable LLM machinery from generate-thread

Service files need to call the LLM. `callLlm` is currently module-private and the API-key guard is duplicated in three functions. Export `callLlm` and extract the guard into an exported `assertApiKey`.

**Files:**
- Modify: `src/lib/generate-thread.ts`
- Test: `src/lib/__tests__/generate-thread.test.ts`

**Interfaces:**
- Produces: `assertApiKey(config: LlmConfig): void` (throws if a non-ollama provider has an empty key); `export async function callLlm(config: LlmConfig, system: string, user: string): Promise<string>`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/__tests__/generate-thread.test.ts`:

```ts
import { assertApiKey } from '../generate-thread';

describe('assertApiKey', () => {
  it('throws when a non-ollama provider has no key', () => {
    expect(() =>
      assertApiKey({ provider: 'groq', baseUrl: 'x', model: 'm', apiKey: '' }),
    ).toThrow(/GROQ_API_KEY/);
  });
  it('passes for ollama with no key', () => {
    expect(() =>
      assertApiKey({ provider: 'ollama', baseUrl: 'x', model: 'm', apiKey: '' }),
    ).not.toThrow();
  });
  it('passes when a key is present', () => {
    expect(() =>
      assertApiKey({ provider: 'groq', baseUrl: 'x', model: 'm', apiKey: 'k' }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/__tests__/generate-thread.test.ts -t assertApiKey`
Expected: FAIL — `assertApiKey is not a function` / no export.

- [ ] **Step 3: Implement**

In `src/lib/generate-thread.ts`: add the `DEFAULTS` key-env lookup into an exported guard and export `callLlm`. Add near the provider abstraction:

```ts
export function assertApiKey(config: LlmConfig): void {
  if (config.provider !== 'ollama' && !config.apiKey) {
    throw new Error(
      `Missing API key for "${config.provider}". Set ${DEFAULTS[config.provider].keyEnv} in .env.local`,
    );
  }
}
```

Change `async function callLlm(` to `export async function callLlm(`. Then in `generateHook`, `regenerateTweet`, and `generateThread`, replace each inline block:

```ts
  if (config.provider !== 'ollama' && !config.apiKey) {
    throw new Error(
      `Missing API key for "${config.provider}". Set ${DEFAULTS[config.provider].keyEnv} in .env.local`,
    );
  }
```

with:

```ts
  assertApiKey(config);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS — all existing tests + the 3 new `assertApiKey` tests (162 total).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/lib/generate-thread.ts src/lib/__tests__/generate-thread.test.ts
git commit -m "refactor(llm): export callLlm + assertApiKey for reuse"
```

---

### Task 2: Service types + x-thread service

Create the registry type surface and the first `ServiceDef` (`x-thread`), wrapping the existing thread generator.

**Files:**
- Create: `src/lib/services/types.ts`
- Create: `src/lib/services/x-thread.ts`
- Test: `src/lib/services/__tests__/x-thread.test.ts`

**Interfaces:**
- Produces (`types.ts`):
```ts
export type ServiceId = 'x-thread' | 'repurpose-thread' | 'hot-takes';
export type ServiceField =
  | { name: string; type: 'text';     label: string; placeholder?: string; maxLen: number; required?: boolean }
  | { name: string; type: 'textarea'; label: string; placeholder?: string; maxLen: number; required?: boolean }
  | { name: string; type: 'select';   label: string; options: { value: string; label: string }[]; default: string }
  | { name: string; type: 'number';   label: string; options: number[]; default: number };
export type GenCtx = { previewHook: string | null };
export type ValidateResult<P> = { ok: true; params: P } | { ok: false; error: string };
export type ServiceDef<P = Record<string, unknown>> = {
  id: ServiceId;
  label: string;
  blurb: string;
  chained: boolean;
  priceStx: number;
  priceSbtc: number;
  fields: ServiceField[];
  validate(raw: unknown): ValidateResult<P>;
  generatePreview(p: P): Promise<string | null>;
  generate(p: P, ctx: GenCtx): Promise<string[]>;
  regenerateOne(p: P, thread: string[], i: number): Promise<string>;
};
export type PublicServiceDef = Pick<ServiceDef,
  'id' | 'label' | 'blurb' | 'chained' | 'priceStx' | 'priceSbtc' | 'fields'>;
```
- Produces (`x-thread.ts`): `export const xThreadService: ServiceDef<XThreadParams>` and `export type XThreadParams = { topic: string; tone: Tone; length: 5|8|12; language: LanguageCode }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/__tests__/x-thread.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { xThreadService as s } from '../x-thread';

describe('x-thread validate', () => {
  it('accepts a well-formed request', () => {
    const r = s.validate({ topic: 'AI agents', tone: 'educational', length: 8, language: 'en' });
    expect(r).toEqual({ ok: true, params: { topic: 'AI agents', tone: 'educational', length: 8, language: 'en' } });
  });
  it('defaults unknown language to auto', () => {
    const r = s.validate({ topic: 'x', tone: 'funny', length: 5, language: 'klingon' });
    expect(r.ok && r.params.language).toBe('auto');
  });
  it('rejects an empty topic', () => {
    expect(s.validate({ topic: '  ', tone: 'funny', length: 5 })).toMatchObject({ ok: false });
  });
  it('rejects a topic over 300 chars', () => {
    expect(s.validate({ topic: 'x'.repeat(301), tone: 'funny', length: 5 })).toMatchObject({ ok: false });
  });
  it('rejects a bad tone', () => {
    expect(s.validate({ topic: 'x', tone: 'nope', length: 5 })).toMatchObject({ ok: false });
  });
  it('rejects a bad length', () => {
    expect(s.validate({ topic: 'x', tone: 'funny', length: 7 })).toMatchObject({ ok: false });
  });
});

describe('x-thread metadata', () => {
  it('is chained and has the four fields', () => {
    expect(s.id).toBe('x-thread');
    expect(s.chained).toBe(true);
    expect(s.fields.map((f) => f.name)).toEqual(['topic', 'tone', 'length', 'language']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/services/__tests__/x-thread.test.ts`
Expected: FAIL — module `../x-thread` not found.

- [ ] **Step 3: Implement types + service**

Create `src/lib/services/types.ts` with the **Interfaces → Produces (types.ts)** block above.

Create `src/lib/services/x-thread.ts`:

```ts
import { TONES, LENGTHS, LANGUAGE_CODES, PRICE_STX, PRICE_SBTC, type Tone, type LanguageCode } from '@/lib/config';
import { generateThread, generateHook, regenerateTweet } from '@/lib/generate-thread';
import type { ServiceDef, GenCtx, ValidateResult } from './types';

export type XThreadParams = { topic: string; tone: Tone; length: 5 | 8 | 12; language: LanguageCode };

function validate(raw: unknown): ValidateResult<XThreadParams> {
  const b = (raw ?? {}) as Record<string, unknown>;
  const topic = typeof b.topic === 'string' ? b.topic.trim() : '';
  const tone = b.tone as Tone;
  const length = Number(b.length);
  const language = (LANGUAGE_CODES as readonly string[]).includes(b.language as string)
    ? (b.language as LanguageCode) : 'auto';
  if (!topic || topic.length > 300) return { ok: false, error: 'topic is required (max 300 chars)' };
  if (!TONES.includes(tone) || !LENGTHS.includes(length as 5 | 8 | 12)) {
    return { ok: false, error: 'invalid tone or length' };
  }
  return { ok: true, params: { topic, tone, length: length as 5 | 8 | 12, language } };
}

export const xThreadService: ServiceDef<XThreadParams> = {
  id: 'x-thread',
  label: 'X Thread',
  blurb: 'Turn an idea into a ready-to-post X thread.',
  chained: true,
  priceStx: PRICE_STX,
  priceSbtc: PRICE_SBTC,
  fields: [
    { name: 'topic', type: 'text', label: 'Topic', placeholder: 'What is the thread about?', maxLen: 300, required: true },
    { name: 'tone', type: 'select', label: 'Tone', default: 'educational',
      options: TONES.map((t) => ({ value: t, label: t })) },
    { name: 'length', type: 'number', label: 'Length', default: 8, options: [...LENGTHS] },
    { name: 'language', type: 'select', label: 'Language', default: 'auto',
      options: [{ value: 'auto', label: 'Auto' }, { value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' },
        { value: 'es', label: 'Español' }, { value: 'fr', label: 'Français' }, { value: 'ja', label: '日本語' }, { value: 'zh', label: '中文' }] },
  ],
  validate,
  generatePreview: (p) => generateHook(p.topic, p.tone, p.language),
  generate: (p, ctx: GenCtx) =>
    generateThread(p.topic, p.tone, p.length, { firstTweet: ctx.previewHook, language: p.language }),
  regenerateOne: (p, thread, i) => regenerateTweet(p.topic, p.tone, thread, i, { language: p.language }),
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/services/__tests__/x-thread.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/lib/services/types.ts src/lib/services/x-thread.ts src/lib/services/__tests__/x-thread.test.ts
git commit -m "feat(services): service types + x-thread ServiceDef"
```

---

### Task 3: repurpose-thread service

A thread distilled from pasted source text. Needs its own prompt; reuses `callLlm` + `parseThreadJson`/`parseHook`.

**Files:**
- Create: `src/lib/services/repurpose-thread.ts`
- Test: `src/lib/services/__tests__/repurpose-thread.test.ts`

**Interfaces:**
- Consumes: `callLlm`, `assertApiKey`, `resolveLlmConfig`, `parseThreadJson`, `parseHook` from `@/lib/generate-thread`; `languageInstruction` from `@/lib/generate-thread`.
- Produces: `export const repurposeThreadService: ServiceDef<RepurposeParams>`, `export type RepurposeParams = { sourceText: string; tone: Tone; length: 5|8|12; language: LanguageCode }`, and a pure `export function buildRepurposeSystem(length: number, language: LanguageCode): string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/__tests__/repurpose-thread.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { repurposeThreadService as s, buildRepurposeSystem } from '../repurpose-thread';

describe('repurpose-thread validate', () => {
  const ok = { sourceText: 'A long article about climate policy.', tone: 'educational', length: 8, language: 'en' };
  it('accepts well-formed input', () => {
    expect(s.validate(ok)).toEqual({ ok: true, params: { ...ok } });
  });
  it('rejects empty sourceText', () => {
    expect(s.validate({ ...ok, sourceText: '   ' })).toMatchObject({ ok: false });
  });
  it('rejects sourceText over 4000 chars', () => {
    expect(s.validate({ ...ok, sourceText: 'x'.repeat(4001) })).toMatchObject({ ok: false });
  });
  it('rejects a bad length', () => {
    expect(s.validate({ ...ok, length: 7 })).toMatchObject({ ok: false });
  });
});

describe('repurpose-thread metadata + prompt', () => {
  it('is chained with a sourceText field', () => {
    expect(s.chained).toBe(true);
    expect(s.fields[0].name).toBe('sourceText');
  });
  it('prompt encodes the language instruction', () => {
    expect(buildRepurposeSystem(8, 'vi')).toContain('Vietnamese');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/services/__tests__/repurpose-thread.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/services/repurpose-thread.ts`:

```ts
import { TONES, LENGTHS, LANGUAGE_CODES, PRICE_STX, PRICE_SBTC, type Tone, type LanguageCode } from '@/lib/config';
import {
  resolveLlmConfig, assertApiKey, callLlm, parseThreadJson, parseHook, languageInstruction,
} from '@/lib/generate-thread';
import type { ServiceDef, GenCtx, ValidateResult } from './types';

export type RepurposeParams = { sourceText: string; tone: Tone; length: 5 | 8 | 12; language: LanguageCode };

const TONE_GUIDE: Record<Tone, string> = {
  educational: 'clear, informative, expert but approachable tone',
  funny: 'witty, meme-aware humor, still delivers real substance',
  threadboi: 'punchy growth-hacker style, bold hooks, strategic emoji (incl. 🧵)',
};

export function buildRepurposeSystem(length: number, language: LanguageCode): string {
  return [
    'You are an expert X (Twitter) thread writer.',
    'You are given a long source text. Distill it into a thread that captures its key points.',
    'Return ONLY a JSON object of the form {"tweets": ["...", "..."]} — one string per tweet.',
    'No markdown fences, no commentary, no numbering prefixes.',
    'Tweet 1 must be a strong hook. The last tweet wraps up with a takeaway or CTA.',
    `Write about ${length} tweets. Each tweet must be under 270 characters.`,
    languageInstruction(language),
  ].join(' ');
}

function validate(raw: unknown): ValidateResult<RepurposeParams> {
  const b = (raw ?? {}) as Record<string, unknown>;
  const sourceText = typeof b.sourceText === 'string' ? b.sourceText.trim() : '';
  const tone = b.tone as Tone;
  const length = Number(b.length);
  const language = (LANGUAGE_CODES as readonly string[]).includes(b.language as string)
    ? (b.language as LanguageCode) : 'auto';
  if (!sourceText || sourceText.length > 4000) return { ok: false, error: 'sourceText is required (max 4000 chars)' };
  if (!TONES.includes(tone) || !LENGTHS.includes(length as 5 | 8 | 12)) {
    return { ok: false, error: 'invalid tone or length' };
  }
  return { ok: true, params: { sourceText, tone, length: length as 5 | 8 | 12, language } };
}

async function generate(p: RepurposeParams, ctx: GenCtx): Promise<string[]> {
  const config = resolveLlmConfig(process.env);
  assertApiKey(config);
  const head = ctx.previewHook && ctx.previewHook.trim() !== '' ? [ctx.previewHook] : [];
  const want = head.length ? p.length - 1 : p.length;
  const system = buildRepurposeSystem(want, p.language);
  const user = `Source text:\n${p.sourceText}\nStyle: ${TONE_GUIDE[p.tone]}`;
  const rest = parseThreadJson(await callLlm(config, system, user));
  return [...head, ...rest].slice(0, p.length);
}

async function generatePreview(p: RepurposeParams): Promise<string | null> {
  const config = resolveLlmConfig(process.env);
  assertApiKey(config);
  const system = [
    'You are an expert X (Twitter) thread writer.',
    'Read the source text and return ONLY {"tweet": "..."} — a single scroll-stopping hook tweet for a thread that summarizes it.',
    'Under 270 characters. No fences, no commentary.',
    languageInstruction(p.language),
  ].join(' ');
  return parseHook(await callLlm(config, system, `Source text:\n${p.sourceText}\nStyle: ${TONE_GUIDE[p.tone]}`));
}

async function regenerateOne(p: RepurposeParams, thread: string[], i: number): Promise<string> {
  const config = resolveLlmConfig(process.env);
  assertApiKey(config);
  const system = [
    'You are an expert X (Twitter) thread writer.',
    'You are given a thread distilled from a source text and the 1-based position of ONE tweet to rewrite.',
    'Return ONLY {"tweet": "..."} — just the rewritten tweet. Keep the others as-is.',
    'Under 270 characters. No numbering prefixes, no commentary, no fences.',
    languageInstruction(p.language),
  ].join(' ');
  const numbered = thread.map((t, idx) => `${idx + 1}. ${t}`).join('\n');
  const user = `Source text:\n${p.sourceText}\nStyle: ${TONE_GUIDE[p.tone]}\nThread:\n${numbered}\n\nRewrite tweet number ${i + 1}.`;
  return parseHook(await callLlm(config, system, user));
}

export const repurposeThreadService: ServiceDef<RepurposeParams> = {
  id: 'repurpose-thread',
  label: 'Repurpose → Thread',
  blurb: 'Paste an article or notes; get a distilled X thread.',
  chained: true,
  priceStx: PRICE_STX,
  priceSbtc: PRICE_SBTC,
  fields: [
    { name: 'sourceText', type: 'textarea', label: 'Source text', placeholder: 'Paste the article or notes…', maxLen: 4000, required: true },
    { name: 'tone', type: 'select', label: 'Tone', default: 'educational', options: TONES.map((t) => ({ value: t, label: t })) },
    { name: 'length', type: 'number', label: 'Length', default: 8, options: [...LENGTHS] },
    { name: 'language', type: 'select', label: 'Language', default: 'auto',
      options: [{ value: 'auto', label: 'Auto' }, { value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' },
        { value: 'es', label: 'Español' }, { value: 'fr', label: 'Français' }, { value: 'ja', label: '日本語' }, { value: 'zh', label: '中文' }] },
  ],
  validate, generatePreview, generate, regenerateOne,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/services/__tests__/repurpose-thread.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/lib/services/repurpose-thread.ts src/lib/services/__tests__/repurpose-thread.test.ts
git commit -m "feat(services): repurpose-thread ServiceDef"
```

---

### Task 4: hot-takes service

N standalone spicy posts (not a chained thread). `chained: false`. Param `count ∈ {3,5,8}`.

**Files:**
- Create: `src/lib/services/hot-takes.ts`
- Test: `src/lib/services/__tests__/hot-takes.test.ts`

**Interfaces:**
- Consumes: same LLM helpers as Task 3.
- Produces: `export const hotTakesService: ServiceDef<HotTakesParams>`, `export type HotTakesParams = { topic: string; tone: Tone; count: 3|5|8; language: LanguageCode }`, pure `export function buildHotTakesSystem(count: number, language: LanguageCode): string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/__tests__/hot-takes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hotTakesService as s, buildHotTakesSystem } from '../hot-takes';

describe('hot-takes validate', () => {
  const ok = { topic: 'remote work', tone: 'threadboi', count: 5, language: 'en' };
  it('accepts well-formed input', () => {
    expect(s.validate(ok)).toEqual({ ok: true, params: { ...ok } });
  });
  it('rejects count outside {3,5,8}', () => {
    expect(s.validate({ ...ok, count: 4 })).toMatchObject({ ok: false });
  });
  it('rejects empty topic', () => {
    expect(s.validate({ ...ok, topic: '' })).toMatchObject({ ok: false });
  });
});

describe('hot-takes metadata + prompt', () => {
  it('is NOT chained', () => {
    expect(s.chained).toBe(false);
    expect(s.id).toBe('hot-takes');
  });
  it('has a count field with 3/5/8', () => {
    const f = s.fields.find((x) => x.name === 'count');
    expect(f && f.type === 'number' && f.options).toEqual([3, 5, 8]);
  });
  it('prompt asks for N standalone posts', () => {
    expect(buildHotTakesSystem(5, 'en')).toMatch(/standalone/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/services/__tests__/hot-takes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/services/hot-takes.ts`:

```ts
import { TONES, LANGUAGE_CODES, PRICE_STX, PRICE_SBTC, type Tone, type LanguageCode } from '@/lib/config';
import {
  resolveLlmConfig, assertApiKey, callLlm, parseThreadJson, parseHook, languageInstruction,
} from '@/lib/generate-thread';
import type { ServiceDef, GenCtx, ValidateResult } from './types';

export type HotTakesParams = { topic: string; tone: Tone; count: 3 | 5 | 8; language: LanguageCode };
const COUNTS = [3, 5, 8] as const;

const TONE_GUIDE: Record<Tone, string> = {
  educational: 'clear, informative, expert but approachable tone',
  funny: 'witty, meme-aware humor, still delivers real substance',
  threadboi: 'punchy growth-hacker style, bold hooks, strategic emoji (incl. 🧵)',
};

export function buildHotTakesSystem(count: number, language: LanguageCode): string {
  return [
    'You are a sharp X (Twitter) writer known for bold, standalone takes.',
    `Return ONLY a JSON object {"tweets": ["...", "..."]} with exactly ${count} items.`,
    'Each item is an INDEPENDENT, standalone post — NOT a numbered thread, no "1/n", no references to the others.',
    'Each must be under 270 characters, punchy, and provocative but defensible.',
    languageInstruction(language),
  ].join(' ');
}

function validate(raw: unknown): ValidateResult<HotTakesParams> {
  const b = (raw ?? {}) as Record<string, unknown>;
  const topic = typeof b.topic === 'string' ? b.topic.trim() : '';
  const tone = b.tone as Tone;
  const count = Number(b.count);
  const language = (LANGUAGE_CODES as readonly string[]).includes(b.language as string)
    ? (b.language as LanguageCode) : 'auto';
  if (!topic || topic.length > 300) return { ok: false, error: 'topic is required (max 300 chars)' };
  if (!TONES.includes(tone)) return { ok: false, error: 'invalid tone' };
  if (!(COUNTS as readonly number[]).includes(count)) return { ok: false, error: 'count must be 3, 5, or 8' };
  return { ok: true, params: { topic, tone, count: count as 3 | 5 | 8, language } };
}

async function generate(p: HotTakesParams, ctx: GenCtx): Promise<string[]> {
  const config = resolveLlmConfig(process.env);
  assertApiKey(config);
  const head = ctx.previewHook && ctx.previewHook.trim() !== '' ? [ctx.previewHook] : [];
  const want = head.length ? p.count - 1 : p.count;
  const system = buildHotTakesSystem(want, p.language);
  const rest = parseThreadJson(await callLlm(config, system, `Topic: ${p.topic}\nStyle: ${TONE_GUIDE[p.tone]}`));
  return [...head, ...rest].slice(0, p.count);
}

async function generatePreview(p: HotTakesParams): Promise<string | null> {
  const config = resolveLlmConfig(process.env);
  assertApiKey(config);
  const system = [
    'You are a sharp X (Twitter) writer known for bold takes.',
    'Return ONLY {"tweet": "..."} — a single standalone hot take on the topic. Under 270 characters. No fences.',
    languageInstruction(p.language),
  ].join(' ');
  return parseHook(await callLlm(config, system, `Topic: ${p.topic}\nStyle: ${TONE_GUIDE[p.tone]}`));
}

async function regenerateOne(p: HotTakesParams, thread: string[], i: number): Promise<string> {
  const config = resolveLlmConfig(process.env);
  assertApiKey(config);
  const system = [
    'You are a sharp X (Twitter) writer known for bold, standalone takes.',
    'Rewrite ONE take so it stays standalone and distinct from the others. Return ONLY {"tweet": "..."}.',
    'Under 270 characters. No numbering, no commentary, no fences.',
    languageInstruction(p.language),
  ].join(' ');
  const others = thread.filter((_, idx) => idx !== i).map((t) => `- ${t}`).join('\n');
  return parseHook(await callLlm(config, system, `Topic: ${p.topic}\nStyle: ${TONE_GUIDE[p.tone]}\nOther takes:\n${others}\n\nWrite a fresh take to replace number ${i + 1}.`));
}

export const hotTakesService: ServiceDef<HotTakesParams> = {
  id: 'hot-takes',
  label: 'Hot-takes Pack',
  blurb: 'One topic → a pack of bold standalone posts.',
  chained: false,
  priceStx: PRICE_STX,
  priceSbtc: PRICE_SBTC,
  fields: [
    { name: 'topic', type: 'text', label: 'Topic', placeholder: 'What do you have takes about?', maxLen: 300, required: true },
    { name: 'tone', type: 'select', label: 'Tone', default: 'threadboi', options: TONES.map((t) => ({ value: t, label: t })) },
    { name: 'count', type: 'number', label: 'How many', default: 5, options: [...COUNTS] },
    { name: 'language', type: 'select', label: 'Language', default: 'auto',
      options: [{ value: 'auto', label: 'Auto' }, { value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' },
        { value: 'es', label: 'Español' }, { value: 'fr', label: 'Français' }, { value: 'ja', label: '日本語' }, { value: 'zh', label: '中文' }] },
  ],
  validate, generatePreview, generate, regenerateOne,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/services/__tests__/hot-takes.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/lib/services/hot-takes.ts src/lib/services/__tests__/hot-takes.test.ts
git commit -m "feat(services): hot-takes ServiceDef (standalone, unchained)"
```

---

### Task 5: Registry

`getService` (throws on unknown) and `publicRegistry` (strips server functions).

**Files:**
- Create: `src/lib/services/registry.ts`
- Test: `src/lib/services/__tests__/registry.test.ts`

**Interfaces:**
- Consumes: the three `ServiceDef` exports.
- Produces: `export const SERVICES: Record<ServiceId, ServiceDef>`; `export function getService(id: string): ServiceDef` (throws `Error('unknown service')`); `export function publicRegistry(): PublicServiceDef[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/__tests__/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SERVICES, getService, publicRegistry } from '../registry';

describe('registry', () => {
  it('has the three launch services', () => {
    expect(Object.keys(SERVICES).sort()).toEqual(['hot-takes', 'repurpose-thread', 'x-thread']);
  });
  it('getService returns a def by id', () => {
    expect(getService('x-thread').id).toBe('x-thread');
  });
  it('getService throws on an unknown id', () => {
    expect(() => getService('nope')).toThrow(/unknown service/);
  });
  it('publicRegistry exposes only public fields (no functions)', () => {
    for (const d of publicRegistry()) {
      expect(Object.keys(d).sort()).toEqual(['blurb', 'chained', 'fields', 'id', 'label', 'priceSbtc', 'priceStx']);
      expect(typeof (d as Record<string, unknown>).validate).toBe('undefined');
      expect(typeof (d as Record<string, unknown>).generate).toBe('undefined');
    }
  });
  it('every def has required public fields', () => {
    for (const d of publicRegistry()) {
      expect(d.id && d.label && d.blurb).toBeTruthy();
      expect(Array.isArray(d.fields) && d.fields.length).toBeTruthy();
      expect(typeof d.chained).toBe('boolean');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/services/__tests__/registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/services/registry.ts`:

```ts
import type { ServiceDef, ServiceId, PublicServiceDef } from './types';
import { xThreadService } from './x-thread';
import { repurposeThreadService } from './repurpose-thread';
import { hotTakesService } from './hot-takes';

export const SERVICES: Record<ServiceId, ServiceDef> = {
  'x-thread': xThreadService as ServiceDef,
  'repurpose-thread': repurposeThreadService as ServiceDef,
  'hot-takes': hotTakesService as ServiceDef,
};

export function getService(id: string): ServiceDef {
  const def = SERVICES[id as ServiceId];
  if (!def) throw new Error('unknown service');
  return def;
}

export function publicRegistry(): PublicServiceDef[] {
  return Object.values(SERVICES).map(({ id, label, blurb, chained, priceStx, priceSbtc, fields }) =>
    ({ id, label, blurb, chained, priceStx, priceSbtc, fields }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/services/__tests__/registry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/lib/services/registry.ts src/lib/services/__tests__/registry.test.ts
git commit -m "feat(services): registry with getService + publicRegistry"
```

---

### Task 6: GET /api/services route

Public endpoint returning `publicRegistry()`.

**Files:**
- Create: `src/app/api/services/route.ts`
- Test: `src/app/api/services/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `publicRegistry` from `@/lib/services/registry`.
- Produces: `export async function GET(): Promise<Response>` → `200 { services: PublicServiceDef[] }`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/services/__tests__/route.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GET } from '../route';

describe('GET /api/services', () => {
  it('returns the public registry', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.services)).toBe(true);
    expect(body.services.map((s: { id: string }) => s.id).sort())
      .toEqual(['hot-takes', 'repurpose-thread', 'x-thread']);
    expect(body.services[0].validate).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/app/api/services/__tests__/route.test.ts`
Expected: FAIL — `../route` not found.

- [ ] **Step 3: Implement**

Create `src/app/api/services/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { publicRegistry } from '@/lib/services/registry';

export async function GET() {
  try {
    return NextResponse.json({ services: publicRegistry() });
  } catch {
    return NextResponse.json({ error: 'failed to load services' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/api/services/__tests__/route.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/app/api/services/route.ts src/app/api/services/__tests__/route.test.ts
git commit -m "feat(api): GET /api/services public registry"
```

---

### Task 7: invoices.ts data model (service_id + params)

Add `service_id`/`params` to types; change `createInvoice` to an object signature; add `service_id` to `Generation` + `saveGenerationAndConsume`. Verified by type-check + the route tasks that follow (route tests mock this module, so behavior is checked there).

**Files:**
- Modify: `src/lib/invoices.ts`

**Interfaces:**
- Produces:
  - `Invoice` gains `service_id: string` and `params: Record<string, unknown> | null`; legacy `topic/tone/length/language` stay optional.
  - `createInvoice(args: { serviceId: string; params: Record<string, unknown>; priceStx: number; priceSbtc: number; previewHook?: string | null }): Promise<Invoice>`.
  - `Generation` gains `service_id: string`.

- [ ] **Step 1: Edit the `Invoice` type**

In `src/lib/invoices.ts`, change the `Invoice` type to:

```ts
export type Invoice = {
  invoice_id: string;
  service_id: string;
  params: Record<string, unknown> | null;
  topic?: string;
  tone?: string;
  length?: number;
  price_stx: number;
  price_sbtc: number;
  status: 'pending' | 'paid' | 'generating' | 'consumed';
  expires_at: string;
  generating_at?: string | null;
  preview_hook?: string | null;
  language?: string | null;
};
```

- [ ] **Step 2: Edit `createInvoice` to the object signature**

Replace the existing `createInvoice` with:

```ts
export async function createInvoice(args: {
  serviceId: string;
  params: Record<string, unknown>;
  priceStx: number;
  priceSbtc: number;
  previewHook?: string | null;
}): Promise<Invoice> {
  const invoice: Invoice = {
    invoice_id: crypto.randomBytes(32).toString('hex'),
    service_id: args.serviceId,
    params: args.params,
    price_stx: args.priceStx,
    price_sbtc: args.priceSbtc,
    status: 'pending',
    expires_at: new Date(Date.now() + INVOICE_TTL_MINUTES * 60_000).toISOString(),
    preview_hook: args.previewHook ?? null,
  };
  const { error } = await supabase.from('invoices').insert(invoice);
  if (error) throw new Error(`createInvoice: ${error.message}`);
  return invoice;
}
```

Remove the now-unused `PRICE_STX, PRICE_SBTC` from the `./config` import in this file if they are no longer referenced (keep `INVOICE_TTL_MINUTES, GENERATING_STALE_MS`).

- [ ] **Step 3: Edit `Generation` + `saveGenerationAndConsume`**

Add `service_id: string;` to the `Generation` type (after `invoice_id`). `saveGenerationAndConsume` already inserts the whole `gen` object, so no body change is needed beyond the type.

- [ ] **Step 4: Verify it type-checks**

Run: `cd frontend && npm run build`
Expected: build FAILS only in `src/app/api/generate/route.ts` and `src/app/api/regenerate/route.ts` (callers still use the old `createInvoice` signature / read `invoice.topic`). That is expected — those are fixed in Tasks 9–11. If any OTHER file fails to compile, fix it before committing.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/lib/invoices.ts
git commit -m "feat(invoices): service_id + params on Invoice/Generation, object createInvoice"
```

---

### Task 8: Migration 0006

Additive columns + backfill. Applied manually in Supabase (not run by tests).

**Files:**
- Create: `supabase/migrations/0006_invoices_service.sql`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/0006_invoices_service.sql`:

```sql
-- Marketplace: tag invoices/generations with a service and store per-service params.
alter table invoices
  add column if not exists service_id text not null default 'x-thread',
  add column if not exists params     jsonb;

-- Backfill existing rows: pack the legacy thread columns into params.
update invoices
  set params = jsonb_build_object(
    'topic', topic, 'tone', tone, 'length', length, 'language', coalesce(language, 'auto'))
  where params is null;

alter table generations
  add column if not exists service_id text not null default 'x-thread';
```

- [ ] **Step 2: Verify SQL shape**

Run: `cd frontend && grep -c "add column" supabase/migrations/0006_invoices_service.sql`
Expected: `3`

- [ ] **Step 3: Commit**

```bash
cd frontend && git add supabase/migrations/0006_invoices_service.sql
git commit -m "feat(db): migration 0006 — invoices/generations service_id + params"
```

Note for the operator: apply `0006_invoices_service.sql` in the Supabase SQL editor before deploying the route changes.

---

### Task 9: /api/generate Branch 1 — service dispatch (quote)

Validate via the chosen service and create the invoice with its price + params.

**Files:**
- Modify: `src/app/api/generate/route.ts` (Branch 1, the `if (!body.invoiceId)` block)
- Test: `src/app/api/generate/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getService`, `publicRegistry` not needed here — only `getService` from `@/lib/services/registry`.
- Produces: 402 response now includes `service: def.id`.

- [ ] **Step 1: Write the failing tests**

Add to `src/app/api/generate/__tests__/route.test.ts` (it already mocks `@/lib/invoices`). Add a mock for the registry near the other `vi.mock` calls and tests:

```ts
import * as registry from '@/lib/services/registry';
vi.mock('@/lib/services/registry', async (orig) => {
  const actual = await orig<typeof import('@/lib/services/registry')>();
  return { ...actual };
});

// ...inside the describe for the quote branch:
it('unknown service → 400', async () => {
  const res = await POST(new Request('http://t/api/generate', {
    method: 'POST', body: JSON.stringify({ service: 'nope', params: {} }),
  }) as unknown as NextRequest);
  expect(res.status).toBe(400);
});

it('missing service defaults to x-thread and quotes 402 with service id', async () => {
  m(invoices.createInvoice).mockResolvedValue({
    invoice_id: 'inv1', service_id: 'x-thread', params: {}, price_stx: 100000, price_sbtc: 100,
    status: 'pending', expires_at: new Date(Date.now() + 60000).toISOString(), preview_hook: null,
  } as never);
  const res = await POST(new Request('http://t/api/generate', {
    method: 'POST', body: JSON.stringify({ params: { topic: 'AI', tone: 'funny', length: 5, language: 'en' } }),
  }) as unknown as NextRequest);
  expect(res.status).toBe(402);
  const body = await res.json();
  expect(body.service).toBe('x-thread');
});

it('invalid params → 400', async () => {
  const res = await POST(new Request('http://t/api/generate', {
    method: 'POST', body: JSON.stringify({ service: 'x-thread', params: { topic: '', tone: 'funny', length: 5 } }),
  }) as unknown as NextRequest);
  expect(res.status).toBe(400);
});
```

(Use the existing test file's helpers/imports — `m`, `invoices`, `NextRequest`, and its `checkRateLimit` mock returning `{ allowed: true }`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/app/api/generate/__tests__/route.test.ts`
Expected: FAIL — Branch 1 still reads `body.topic` and `createInvoice` is called with old args.

- [ ] **Step 3: Implement Branch 1**

In `src/app/api/generate/route.ts`, add import:

```ts
import { getService } from '@/lib/services/registry';
```

Replace the body of `if (!body.invoiceId) { ... }` with:

```ts
  if (!body.invoiceId) {
    let def;
    try {
      def = getService(typeof body.service === 'string' ? body.service : 'x-thread');
    } catch {
      return NextResponse.json({ error: 'unknown service' }, { status: 400 });
    }
    const v = def.validate(body.params);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    const rl = await checkRateLimit(`quote:${clientIp(req)}`, {
      max: RATE_LIMIT_QUOTE_MAX, windowSec: RATE_LIMIT_QUOTE_WINDOW_SEC,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'rate limit exceeded, slow down', retryAfterSec: rl.retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    let previewHook: string | null = null;
    try {
      previewHook = await def.generatePreview(v.params);
    } catch (e) {
      log.warn('generate.preview_hook_failed', { err: e });
    }

    const invoice = await createInvoice({
      serviceId: def.id, params: v.params as Record<string, unknown>,
      priceStx: def.priceStx, priceSbtc: def.priceSbtc, previewHook,
    });
    return NextResponse.json({
      invoiceId: invoice.invoice_id,
      service: def.id,
      priceStx: invoice.price_stx,
      priceSbtc: invoice.price_sbtc,
      contract: CONTRACT,
      sbtcContract: SBTC_CONTRACT,
      expiresAt: invoice.expires_at,
      previewHook,
    }, { status: 402 });
  }
```

Remove now-unused imports from `@/lib/config` (`TONES, LENGTHS, LANGUAGE_CODES, Tone, LanguageCode`) if Branch 2 no longer uses them after Task 10; if Task 10 isn't done yet, leave them and clean up in Task 10.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/api/generate/__tests__/route.test.ts -t 'quote\|service\|400\|402'`
Expected: PASS for the new Branch 1 tests. (Branch 2 tests may still fail until Task 10 — acceptable mid-task; do not commit if a PREVIOUSLY-passing Branch 1 test regressed.)

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/app/api/generate/route.ts src/app/api/generate/__tests__/route.test.ts
git commit -m "feat(generate): Branch 1 dispatches validate+quote by service"
```

---

### Task 10: /api/generate Branch 2 — generate by service

Dispatch generation off `invoice.service_id` + `invoice.params`; never read service/params from the client body.

**Files:**
- Modify: `src/app/api/generate/route.ts` (Branch 2 generate call)
- Test: `src/app/api/generate/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getService`, `invoice.service_id`, `invoice.params`, `invoice.preview_hook`.

- [ ] **Step 1: Write the failing test**

Add to `src/app/api/generate/__tests__/route.test.ts` a test asserting dispatch uses the invoice, not the client body. Mock `getService` to a stub whose `generate` records its inputs:

```ts
it('Branch 2 generates from invoice.params/service, ignoring client body', async () => {
  const seen: { params: unknown; ctx: unknown }[] = [];
  vi.spyOn(registry, 'getService').mockReturnValue({
    id: 'x-thread', label: '', blurb: '', chained: true, priceStx: 100000, priceSbtc: 100, fields: [],
    validate: () => ({ ok: true, params: {} }),
    generatePreview: async () => null,
    generate: async (params, ctx) => { seen.push({ params, ctx }); return ['t1', 't2']; },
    regenerateOne: async () => 't',
  } as never);

  m(invoices.getInvoice).mockResolvedValue({
    invoice_id: 'inv1', service_id: 'x-thread', params: { topic: 'real' },
    price_stx: 100000, price_sbtc: 100, status: 'pending',
    expires_at: new Date(Date.now() + 60000).toISOString(), preview_hook: 'hook',
  } as never);
  m(invoices.claimInvoice).mockResolvedValue(true);
  m(invoices.getGeneration).mockResolvedValue(null);
  m(invoices.saveGenerationAndConsume).mockImplementation(async (g) => g as never);
  // receipt mock returns a sufficient STX payment (reuse the file's fetchReceipt mock)

  const res = await POST(new Request('http://t/api/generate', {
    method: 'POST', body: JSON.stringify({ invoiceId: 'inv1', txId: '0xabc', params: { topic: 'HACKED' } }),
  }) as unknown as NextRequest);
  expect(res.status).toBe(200);
  expect(seen[0].params).toEqual({ topic: 'real' });   // from invoice, not 'HACKED'
  expect(seen[0].ctx).toEqual({ previewHook: 'hook' });
});
```

Match the file's existing `fetchReceipt` mock so the receipt check passes (STX amount ≥ 100000).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/app/api/generate/__tests__/route.test.ts -t 'Branch 2 generates'`
Expected: FAIL — route still calls `generateThread(invoice.topic, ...)`.

- [ ] **Step 3: Implement Branch 2 dispatch**

In `src/app/api/generate/route.ts`, replace:

```ts
    thread = await generateThread(invoice.topic, invoice.tone as Tone, invoice.length, {
      firstTweet: invoice.preview_hook ?? null,
      language: invoice.language ?? null,
    });
```

with:

```ts
    const def = getService(invoice.service_id);
    thread = await def.generate(invoice.params ?? {}, { previewHook: invoice.preview_hook ?? null });
```

Add `service_id: invoice.service_id` to the object passed to `saveGenerationAndConsume`. Remove the now-unused `generateThread` import and the unused `@/lib/config` thread imports (`TONES, LENGTHS, LANGUAGE_CODES, Tone, LanguageCode`). Keep `generateHook`? It is no longer used here — remove it too. Keep `CONTRACT, SBTC_CONTRACT, RATE_LIMIT_*`.

- [ ] **Step 4: Run the full generate suite**

Run: `cd frontend && npx vitest run src/app/api/generate/__tests__/route.test.ts`
Expected: PASS — Branch 1 + Branch 2 + all pre-existing generate tests. Update any pre-existing test that constructed an invoice without `service_id`/`params` to include them (`service_id: 'x-thread', params: {...}`).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/app/api/generate/route.ts src/app/api/generate/__tests__/route.test.ts
git commit -m "feat(generate): Branch 2 generates via service registry from invoice"
```

---

### Task 11: /api/regenerate — dispatch regenerateOne by service

**Files:**
- Modify: `src/app/api/regenerate/route.ts`
- Test: `src/app/api/regenerate/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getService`, `invoice.service_id`, `invoice.params`.

- [ ] **Step 1: Write the failing test**

In `src/app/api/regenerate/__tests__/route.test.ts`, add a registry mock and a test that the rewritten tweet comes from `getService(invoice.service_id).regenerateOne`:

```ts
import * as registry from '@/lib/services/registry';
// ...
it('rerolls one tweet via the invoice service', async () => {
  vi.spyOn(registry, 'getService').mockReturnValue({
    id: 'x-thread', label: '', blurb: '', chained: true, priceStx: 1, priceSbtc: 1, fields: [],
    validate: () => ({ ok: true, params: {} }),
    generatePreview: async () => null,
    generate: async () => [],
    regenerateOne: async () => 'REROLLED',
  } as never);
  // existing mocks: getInvoice → { service_id:'x-thread', params:{topic:'x',tone:'funny',language:'en'} ... },
  //                 getGeneration → gen({ regen_count: 0 }), authenticated payer, regenerateGeneration echoes input
  // ...call POST with a valid index, assert the persisted thread contains 'REROLLED' at that index.
});
```

(Reuse the file's existing auth/ownership/`gen()` helpers; the invoice mock must now include `service_id: 'x-thread'` and `params`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/app/api/regenerate/__tests__/route.test.ts -t 'rerolls one tweet via the invoice service'`
Expected: FAIL — route still calls `regenerateTweet(invoice.topic, ...)`.

- [ ] **Step 3: Implement**

In `src/app/api/regenerate/route.ts`, add `import { getService } from '@/lib/services/registry';`. Replace the `regenerateTweet(...)` call with:

```ts
    const def = getService(invoice.service_id);
    const newTweet = await def.regenerateOne(invoice.params ?? {}, thread, index);
```

Remove the now-unused `regenerateTweet` import and any unused `@/lib/config` thread imports.

- [ ] **Step 4: Run the regenerate suite**

Run: `cd frontend && npx vitest run src/app/api/regenerate/__tests__/route.test.ts`
Expected: PASS — new test + all pre-existing regenerate tests (update invoice mocks to include `service_id`/`params`).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/app/api/regenerate/route.ts src/app/api/regenerate/__tests__/route.test.ts
git commit -m "feat(regenerate): dispatch single-tweet reroll via service registry"
```

---

### Task 12: post-to-X numbering respects `chained`

`withThreadNumbers` should skip `i/n` markers when the service is unchained (hot-takes).

**Files:**
- Modify: `src/lib/postToX.ts`
- Test: `src/lib/__tests__/postToX.test.ts`

**Interfaces:**
- Produces: `withThreadNumbers(thread: string[], chained?: boolean): string[]` — default `chained = true` (back-compat). When `chained === false`, returns a copy with no markers.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/__tests__/postToX.test.ts`:

```ts
import { withThreadNumbers } from '../postToX';

describe('withThreadNumbers chained flag', () => {
  it('numbers when chained (default)', () => {
    expect(withThreadNumbers(['a', 'b'])[0]).toContain('1/2');
  });
  it('does not number when chained=false', () => {
    expect(withThreadNumbers(['a', 'b'], false)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/__tests__/postToX.test.ts -t 'chained flag'`
Expected: FAIL — `withThreadNumbers` ignores the second argument.

- [ ] **Step 3: Implement**

In `src/lib/postToX.ts`, change the signature and add an early return:

```ts
export function withThreadNumbers(thread: string[], chained: boolean = true): string[] {
  const n = thread.length;
  if (!chained || n <= 1) return thread.slice();
  // ...unchanged numbering body...
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/__tests__/postToX.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/lib/postToX.ts src/lib/__tests__/postToX.test.ts
git commit -m "feat(post-to-x): skip i/n numbering for unchained services"
```

---

### Task 13: PostThreadModal accepts `chained`

**Files:**
- Modify: `src/components/PostThreadModal.tsx`

**Interfaces:**
- Consumes: `withThreadNumbers(thread, chained)`.
- Produces: `PostThreadModal({ thread, chained, open, onClose })` — `chained?: boolean` default `true`.

- [ ] **Step 1: Add the prop and thread it through**

In `src/components/PostThreadModal.tsx`, change the props type to include `chained?: boolean;` and the function signature to destructure `chained = true`. Change `const numbered = withThreadNumbers(thread);` to `const numbered = withThreadNumbers(thread, chained);`.

- [ ] **Step 2: Verify it builds**

Run: `cd frontend && npm run build`
Expected: PASS (no type errors). If `page.tsx` doesn't yet pass `chained`, the default keeps it compiling.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/PostThreadModal.tsx
git commit -m "feat(post-to-x): PostThreadModal chained prop"
```

---

### Task 14: ServiceForm — pure helpers + dynamic form component

A data-driven form rendered from a service's `fields`. Extract pure helpers (testable) from the component (build-verified).

**Files:**
- Create: `src/lib/services/form.ts` (pure helpers)
- Create: `src/components/ServiceForm.tsx`
- Test: `src/lib/services/__tests__/form.test.ts`

**Interfaces:**
- Produces (`form.ts`):
  - `defaultParams(fields: ServiceField[]): Record<string, unknown>` — text/textarea → `''`; select/number → its `default`.
  - `clientValidate(fields: ServiceField[], params: Record<string, unknown>): string | null` — returns the first error message or `null`. Checks `required` non-empty and `maxLen` for text/textarea.
- Produces (`ServiceForm.tsx`): `ServiceForm({ fields, params, onChange, disabled })` rendering AntD inputs by field type.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/__tests__/form.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultParams, clientValidate } from '../form';
import type { ServiceField } from '../types';

const fields: ServiceField[] = [
  { name: 'topic', type: 'text', label: 'Topic', maxLen: 300, required: true },
  { name: 'tone', type: 'select', label: 'Tone', default: 'educational', options: [{ value: 'educational', label: 'e' }] },
  { name: 'length', type: 'number', label: 'Length', default: 8, options: [5, 8, 12] },
];

describe('defaultParams', () => {
  it('seeds text empty and select/number to their default', () => {
    expect(defaultParams(fields)).toEqual({ topic: '', tone: 'educational', length: 8 });
  });
});

describe('clientValidate', () => {
  it('flags a missing required field', () => {
    expect(clientValidate(fields, { topic: '', tone: 'educational', length: 8 })).toMatch(/Topic/);
  });
  it('flags over-maxLen text', () => {
    expect(clientValidate(fields, { topic: 'x'.repeat(301), tone: 'educational', length: 8 })).toMatch(/Topic/);
  });
  it('returns null when valid', () => {
    expect(clientValidate(fields, { topic: 'ok', tone: 'educational', length: 8 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/services/__tests__/form.test.ts`
Expected: FAIL — `../form` not found.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/services/form.ts`:

```ts
import type { ServiceField } from './types';

export function defaultParams(fields: ServiceField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    out[f.name] = f.type === 'text' || f.type === 'textarea' ? '' : f.default;
  }
  return out;
}

export function clientValidate(fields: ServiceField[], params: Record<string, unknown>): string | null {
  for (const f of fields) {
    if (f.type === 'text' || f.type === 'textarea') {
      const val = typeof params[f.name] === 'string' ? (params[f.name] as string) : '';
      if (f.required && val.trim() === '') return `${f.label} is required`;
      if (val.length > f.maxLen) return `${f.label} is too long (max ${f.maxLen})`;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/services/__tests__/form.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement the component**

Create `src/components/ServiceForm.tsx`. Follow the existing `ThreadForm.tsx` styling/tokens. Render by field type:

```tsx
'use client';
import { Input, Select, Segmented, Typography } from 'antd';
import type { ServiceField } from '@/lib/services/types';

const { Text } = Typography;

export function ServiceForm({ fields, params, onChange, disabled }: {
  fields: ServiceField[];
  params: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      {fields.map((f) => (
        <div key={f.name} style={{ marginBottom: 12 }}>
          <Text style={{ display: 'block', marginBottom: 6 }}>{f.label}</Text>
          {f.type === 'text' && (
            <Input maxLength={f.maxLen} showCount placeholder={f.placeholder} disabled={disabled}
              value={params[f.name] as string} onChange={(e) => onChange(f.name, e.target.value)} />
          )}
          {f.type === 'textarea' && (
            <Input.TextArea maxLength={f.maxLen} showCount rows={6} placeholder={f.placeholder} disabled={disabled}
              value={params[f.name] as string} onChange={(e) => onChange(f.name, e.target.value)} />
          )}
          {f.type === 'select' && (
            <Select style={{ width: '100%' }} disabled={disabled} value={params[f.name]}
              options={f.options} onChange={(v) => onChange(f.name, v)} />
          )}
          {f.type === 'number' && (
            <Segmented disabled={disabled} value={params[f.name] as number}
              options={f.options.map((n) => ({ label: String(n), value: n }))}
              onChange={(v) => onChange(f.name, v)} />
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Verify it builds**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/lib/services/form.ts src/lib/services/__tests__/form.test.ts src/components/ServiceForm.tsx
git commit -m "feat(ui): ServiceForm dynamic field renderer + pure form helpers"
```

---

### Task 15: ServicePicker component

A segmented control to choose a service; shows label + price.

**Files:**
- Create: `src/components/ServicePicker.tsx`

**Interfaces:**
- Consumes: `PublicServiceDef[]`.
- Produces: `ServicePicker({ services, selectedId, onSelect, disabled })`.

- [ ] **Step 1: Implement**

Create `src/components/ServicePicker.tsx`:

```tsx
'use client';
import { Segmented, Typography } from 'antd';
import type { PublicServiceDef } from '@/lib/services/types';

const { Text } = Typography;

export function ServicePicker({ services, selectedId, onSelect, disabled }: {
  services: PublicServiceDef[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const selected = services.find((s) => s.id === selectedId);
  return (
    <div style={{ marginBottom: 16 }}>
      <Segmented
        block
        disabled={disabled}
        value={selectedId}
        onChange={(v) => onSelect(String(v))}
        options={services.map((s) => ({ label: s.label, value: s.id }))}
      />
      {selected && (
        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
          {selected.blurb}
        </Text>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/ServicePicker.tsx
git commit -m "feat(ui): ServicePicker segmented control"
```

---

### Task 16: Wire picker + dynamic form into page.tsx

Fetch the registry, render the picker + `ServiceForm`, submit `{ service, params }`, and pass `chained` to `PostThreadModal`. Fall back to `x-thread` only if the fetch fails.

**Files:**
- Modify: `src/app/page.tsx`
- Modify (as needed): `src/components/ThreadForm.tsx` (replace its inputs with `ServiceForm`, or retire it in favor of `ServiceForm` — keep submit button/price UI).

**Interfaces:**
- Consumes: `GET /api/services` → `{ services: PublicServiceDef[] }`; `defaultParams`, `clientValidate` from `@/lib/services/form`; `ServicePicker`, `ServiceForm`.

- [ ] **Step 1: Load services + selection state**

In `src/app/page.tsx`, add state: `services` (PublicServiceDef[]), `selectedId` (default `'x-thread'`), `params` (Record). On mount, `fetch('/api/services')` → set `services`; on error, set `services` to a single hardcoded `x-thread` stub `{ id:'x-thread', label:'X Thread', blurb:'', chained:true, priceStx, priceSbtc, fields:[] }` is insufficient for the form — instead, on error keep the picker hidden and render only what the API would have given; simplest: set `services = []` and, when empty, hide the picker and skip submission with an inline error "services unavailable, retry". (Marketplace is an enhancement; never crash.) When `services` loads or `selectedId` changes, reset `params = defaultParams(selectedService.fields)`.

- [ ] **Step 2: Render picker + form + price**

Replace the existing hardcoded `ThreadForm` inputs with:

```tsx
{services.length > 0 && (
  <ServicePicker services={services} selectedId={selectedId} onSelect={setSelectedId} disabled={busy} />
)}
{selectedService && (
  <ServiceForm fields={selectedService.fields} params={params}
    onChange={(name, value) => setParams((p) => ({ ...p, [name]: value }))} disabled={busy} />
)}
```

Show price from `selectedService.priceStx` / `priceSbtc` where the existing price UI lives.

- [ ] **Step 3: Submit with service + params**

In the quote request, send `JSON.stringify({ service: selectedId, params })`. Before sending, run `const err = clientValidate(selectedService.fields, params); if (err) { setError(err); return; }`. Keep the rest of the pay/generate flow unchanged.

- [ ] **Step 4: Pass `chained` to PostThreadModal**

Where `PostThreadModal` is rendered, pass `chained={selectedService?.chained ?? true}`.

- [ ] **Step 5: Verify it builds + run the full test suite**

Run: `cd frontend && npm run build && npm test`
Expected: build PASS; `npm test` PASS (all tests green).

- [ ] **Step 6: Manual smoke (operator)**

Run `npm run dev`, then in the browser: pick each of the three services, confirm the form fields change, submit `x-thread` end-to-end on testnet (quote → pay → generate), and confirm `hot-takes` post-to-X shows no `i/n` numbering.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/app/page.tsx src/components/ThreadForm.tsx
git commit -m "feat(ui): wire service picker + dynamic form into the generate page"
```

---

### Task 17: History service tag

Show which service produced each past generation.

**Files:**
- Modify: the history list component (find it: `cd frontend && grep -rl "history" src/components`) and/or the history fetch in `src/app/page.tsx`.
- Modify (if needed): the history API route to include `service_id` in each row.

**Interfaces:**
- Consumes: `generations.service_id` (added in Task 8) and `SERVICES`/`publicRegistry()` labels.

- [ ] **Step 1: Include service_id in the history payload**

Find the history endpoint (`cd frontend && grep -rn "from('generations')" src/app/api`). Ensure its `select` includes `service_id` (use `select('*')` or add the column). If history reads via a lib function, add `service_id` to the returned shape.

- [ ] **Step 2: Render a tag per history item**

In the history list component, map `service_id` → a label using a small lookup (`{ 'x-thread': 'X Thread', 'repurpose-thread': 'Repurpose', 'hot-takes': 'Hot-takes' }`) and render an AntD `<Tag>` on each item. Default unknown ids to `'X Thread'` (back-compat for rows defaulted to `x-thread`).

- [ ] **Step 3: Verify it builds + tests**

Run: `cd frontend && npm run build && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add -A src/app src/components
git commit -m "feat(history): tag each generation with its service"
```

---

## Final verification

- [ ] Run `cd frontend && npm test` — all tests green (target: existing 159 + new service/registry/route/form/postToX tests).
- [ ] Run `cd frontend && npm run build` — clean production build (webpack).
- [ ] Run `cd frontend && npm run lint` — no new lint errors.
- [ ] Operator: apply `supabase/migrations/0006_invoices_service.sql` in Supabase before deploying.
- [ ] Operator manual smoke on testnet: one full paid generation per service; confirm post-to-X numbering on/off by `chained`.

## Self-review notes (coverage vs spec)

- Spec §3 registry/types/services → Tasks 2–5. §3.2 `getService`/`publicRegistry` → Task 5.
- Spec §4 data model + migration → Tasks 7–8.
- Spec §5 data flow (Branch 1/2, regenerate, GET /api/services) → Tasks 6, 9, 10, 11.
- Spec §6 preview/error handling → folded into Tasks 2–4 (per-service `generatePreview`, graceful degrade in Task 9) and Task 9 (validation 400s, unknown service).
- Spec §7 UI (registry load, picker, dynamic form, output/post-to-X chained, history tag) → Tasks 12–17.
- Spec §8 testing → test steps throughout + Final verification.
- Security invariant (Branch 2 reads invoice, not client body) → Task 10 Step 1 explicit test.
- Preview-hook pinning via `GenCtx` → Tasks 2–4 `generate` + Task 10 dispatch.
