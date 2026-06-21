# Marketplace of multiple AI services (single operator) — design

**Date:** 2026-06-21
**Status:** Approved (brainstorming) — ready for implementation plan

## 1. Goal

Extend the x402 pay-per-generate gate so the single operator (ThreadGogh) can
offer **several content services** behind the same payment flow, not just X
threads. This is the **single-operator** marketplace (variant A): one backend,
one treasury, one contract; multiple service "products". A future multi-tenant
marketplace (third-party providers, per-provider payout) is explicitly out of
scope and would be its own spec.

### Launch service set (v1)

All three output `string[]` so the **entire existing output UI is reused**
unchanged (TweetCard, inline edit, single-tweet reroll, post-to-X).

| Service `id`        | Input fields                                   | Intent                                   | `chained` |
|---------------------|------------------------------------------------|------------------------------------------|-----------|
| `x-thread`          | `topic`, `tone`, `length`, `language`          | Idea → X thread (existing behavior)      | `true`    |
| `repurpose-thread`  | `sourceText`, `tone`, `length`, `language`     | Paste a long article/notes → X thread    | `true`    |
| `hot-takes`         | `topic`, `tone`, `count`, `language`           | Topic → N standalone spicy posts         | `false`   |

Services whose output is **not** a thread (LinkedIn long-form post, blog
outline, cold email) are deferred to a follow-up spec — they need a different
output renderer.

## 2. Key constraint: zero contract change

`thread-pay` is **service-agnostic** — it stores a receipt keyed by an opaque
32-byte `invoice-id` with `amount >= min-price`; it has no notion of "thread".
Therefore the marketplace is a **purely off-chain change** (DB + server + UI).
The deployed testnet contract (`ST2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB4PBYSC2.thread-pay`)
is untouched, and the existing payment flow stays backward-compatible. There are
no mainnet (real-money) users; only ~8 disposable testnet transactions exist, so
back-compat pressure is low and a clean uniform data model is preferred.

## 3. Architecture: server-side service registry (Approach A)

A new module `src/lib/services/` is the single source of truth. Each service is
a `ServiceDef`; `/api/generate` stays a **single route** and dispatches by
`service_id`. Adding a service = adding one object (no migration, no new route).

Rejected alternatives: per-service routes/branches (duplicates the
payment/lock/rate-limit pipeline — the risky part), and plugin auto-registration
(over-engineered for 3 services; revisit only if going multi-tenant).

### 3.1 `ServiceDef`

```ts
type ServiceId = 'x-thread' | 'repurpose-thread' | 'hot-takes';

type ServiceField =
  | { name: string; type: 'text';     label: string; placeholder?: string; maxLen: number; required?: boolean }
  | { name: string; type: 'textarea'; label: string; placeholder?: string; maxLen: number; required?: boolean }
  | { name: string; type: 'select';   label: string; options: { value: string; label: string }[]; default: string }
  | { name: string; type: 'number';   label: string; options: number[]; default: number };

type ServiceDef<P = Record<string, unknown>> = {
  // ── Public (safe to send to the client) ──
  id: ServiceId;
  label: string;            // "X Thread"
  blurb: string;            // short picker description
  chained: boolean;         // post-to-X i/n numbering on/off
  priceStx: number;         // defaults to PRICE_STX
  priceSbtc: number;        // defaults to PRICE_SBTC
  fields: ServiceField[];   // declarative form schema for the client

  // ── Server-only ──
  validate(raw: unknown): { ok: true; params: P } | { ok: false; error: string };
  generatePreview(p: P): Promise<string | null>;            // free quote-time hook
  generate(p: P, ctx: GenCtx): Promise<string[]>;           // produce content
  regenerateOne(p: P, thread: string[], i: number): Promise<string>; // reroll one item
};

// Context passed to generate(). `previewHook` is the free hook shown at quote
// time, stored on the invoice; services reuse it so the paid output opens with
// the exact tweet the user already previewed (preserves current x-thread
// behavior). x-thread/repurpose-thread pin it as tweet 1; hot-takes prepends it
// as the first take; a null/empty hook is ignored.
type GenCtx = { previewHook: string | null };
```

### 3.2 Registry module

`src/lib/services/registry.ts` exports:
- `SERVICES: Record<ServiceId, ServiceDef>`
- `getService(id: string): ServiceDef` — throws on unknown id
- `publicRegistry(): PublicServiceDef[]` — projects only public fields
  (`id, label, blurb, chained, priceStx, priceSbtc, fields`); never the
  server-only functions

Each service lives in its own file (`x-thread.ts`, `repurpose-thread.ts`,
`hot-takes.ts`) and reuses the existing generic LLM helpers
(`resolveLlmConfig`, `callLlm`, `parseThreadJson`, `parseHook` from
`generate-thread.ts`). `x-thread` wraps the current `generate-thread.ts` logic
behind the interface with minimal internal change.

### 3.3 Field definitions

- `x-thread`: `topic`(text, 300) · `tone`(select, TONES) · `length`(number, 5/8/12) · `language`(select, LANGUAGES)
- `repurpose-thread`: `sourceText`(textarea, 4000) · `tone` · `length` · `language`
- `hot-takes`: `topic`(text, 300) · `tone` · `count`(number, 3/5/8) · `language`

## 4. Data model

Uniform model: every service stores its inputs in `params jsonb`. Legacy thread
columns are retained (unused) and a backfill keeps old rows readable. Dropping
the legacy columns is a trivial later cleanup, out of scope here.

### Migration `0006_invoices_service.sql`

```sql
alter table invoices
  add column service_id text not null default 'x-thread',
  add column params     jsonb;

update invoices
  set params = jsonb_build_object(
    'topic', topic, 'tone', tone, 'length', length, 'language', coalesce(language, 'auto'))
  where params is null;

alter table generations
  add column service_id text not null default 'x-thread';
```

- `price_stx`/`price_sbtc` already exist on `invoices`; per-service pricing is
  just writing `def.priceStx/priceSbtc` at invoice creation. Receipt
  verification still compares `amount >= invoice.price_stx` — unchanged, safe.
- `generations.service_id` lets the client render the right service tag and pass
  the correct `chained` flag to post-to-X.

### `invoices.ts` changes

- `Invoice` type: add `service_id: string`, `params: Record<string, unknown> | null`;
  keep legacy `topic/tone/length/language` optional for back-compat reads.
- `createInvoice` signature changes from positional thread args to an object:
  `createInvoice({ serviceId, params, priceStx, priceSbtc, previewHook })`.
- `Generation` type + `saveGenerationAndConsume`: add `service_id`.
- `regenerateGeneration` unchanged (operates only on `thread_content` + `regen_count`).

## 5. Data flow

`/api/generate` keeps its 2-branch shape and **all** payment / lock /
rate-limit / receipt logic. Only input validation and the LLM call dispatch by
service.

### Branch 1 — Quote (HTTP 402)

```
body = { service?: ServiceId, params: {...} }   // missing service → 'x-thread'
def  = getService(body.service ?? 'x-thread')    // unknown → 400 'unknown service'
v    = def.validate(body.params)                 // !v.ok → 400 { error: v.error }
rate-limit by IP (unchanged)
preview = await def.generatePreview(v.params)     // failure degrades: still quote
invoice = createInvoice({ serviceId: def.id, params: v.params,
                          priceStx: def.priceStx, priceSbtc: def.priceSbtc,
                          previewHook: preview })
→ 402 { invoiceId, priceStx, priceSbtc, contract, sbtcContract, expiresAt, previewHook, service: def.id }
```

### Branch 2 — Verify receipt → generate

```
invoice = getInvoice(invoiceId)                  // carries service_id + params
verify on-chain receipt: amount >= invoice.price_stx   // unchanged
claimInvoice(invoiceId)                          // atomic lock, unchanged
def = getService(invoice.service_id)
thread = await def.generate(invoice.params, { previewHook: invoice.preview_hook ?? null })
saveGenerationAndConsume({ ...gen, service_id: def.id, thread_content: thread })
→ 200 { thread, service: def.id }
```

**Security invariant:** Branch 2 reads service + params from the **invoice
(server state)**, never from the client body. The client cannot change service
or params after paying. The on-chain receipt + the stored invoice remain the
sole source of truth for what was paid for.

### Regenerate (`/api/regenerate`, single-tweet reroll)

```
invoice = getInvoice(invoiceId)
def = getService(invoice.service_id)
newItem = await def.regenerateOne(invoice.params, thread, index)
regenerateGeneration(...)   // compare-and-swap, unchanged
```

Payer-auth, ownership check, and `regen_count` cap are unchanged; only the LLM
call dispatches by service.

### `GET /api/services` (new, public)

Returns `publicRegistry()` so the client can render the picker + dynamic form.
No server-only functions are exposed.

## 6. Preview & error handling

- **Free preview hook** generalizes per service (one cheap LLM call each):
  `x-thread` → opening hook (existing `generateHook`); `repurpose-thread` → hook
  drawn from `sourceText`; `hot-takes` → one sample take. Failure degrades
  gracefully (`log.warn` + `previewHook = null`, still quote) — same as today.
- **Validation errors (Branch 1):** `def.validate` returns `{ ok:false, error }`
  → `400 { error }`. Allow-list style matching the existing code
  (`TONES.includes`, etc.): e.g. `repurpose-thread` requires non-empty
  `sourceText` ≤ 4000 chars; `hot-takes` requires `count ∈ {3,5,8}`. Unknown
  service → `400 'unknown service'`.
- **Generate errors (Branch 2):** LLM/parse failure → `releaseInvoice`
  (generating → pending) → free retry (receipt persists on-chain). Unchanged.
- **Lock / double-spend / idempotency:** untouched — `claimInvoice` and
  `saveGenerationAndConsume` (unique constraint) are already service-agnostic.
- **`GET /api/services`:** static in-memory registry; wrapped in try/catch
  returning 500 for consistency. The client falls back to showing only
  `x-thread` if the fetch fails — the marketplace is an enhancement, not a
  single point of failure.

## 7. UI

Current flow (`page.tsx` → `ThreadForm` → quote/pay/generate → `TweetCard[]` →
`PostThreadModal`) is preserved; output rendering is unchanged.

1. **Load registry:** on mount, `GET /api/services` (fallback: `x-thread` only).
2. **Service picker:** a **segmented control** above the form (lean default for
   3 services; swapping to cards later is a component swap). Each entry shows
   `label` + `blurb` + price; switching service swaps the form and price.
3. **`ServiceForm` (dynamic):** renders inputs from the selected service's
   `fields` (`text`→Input, `textarea`→Input.TextArea with char count,
   `select`→Select, `number`→Segmented/Select). State is a `params` object keyed
   by `field.name`. Light client-side validation (required/maxLen) for UX only;
   server `validate` is authoritative. `ThreadForm` is generalized into this
   renderer, preserving the existing visual tokens/styling for `x-thread`.
4. **Submit:** `POST /api/generate { service, params }`. The 402 → wallet sign →
   generate steps are unchanged.
5. **Output + post-to-X:** `TweetCard[]` unchanged. `PostThreadModal` gains a
   `chained` prop (from the selected service); `withThreadNumbers` skips i/n
   numbering when `chained === false` (hot-takes are standalone). Inline edit and
   single-reroll unchanged.
6. **History drawer:** each generation now has `service_id` → show a small tag
   ("X Thread" / "Repurpose" / "Hot-takes") per history item.

Visual scope: `x-thread` looks identical; only a picker bar is added and the form
becomes data-driven. No theme/layout changes.

## 8. Testing

Vitest, unit + route tests, mocking `invoices`, `receipt`, and LLM `fetch` (no
real network/DB) — matching the existing style.

- **Registry/services unit:** `getService` throws on unknown id; `publicRegistry()`
  exposes no server functions; every `ServiceDef` has required fields. Each
  service `validate()`: valid → `{ok, params}`; missing/empty `sourceText`,
  over-maxLen, bad `count`, bad `tone` → `{ok:false, error}`.
  `withThreadNumbers` with `chained=false` → no numbering (added to `postToX.test.ts`).
- **`/api/generate`:** quote with missing `service` → defaults to `x-thread`;
  unknown service → 400; bad params → 400; valid → 402 with `service` + the
  service's price. Generate branch dispatches on `invoice.service_id` /
  `invoice.params` (not client body) — assert the client cannot override service
  or params. All existing tests (lock, double-spend, stale, rate-limit,
  preview-degrade) stay green.
- **`/api/regenerate`:** dispatches `regenerateOne` by `invoice.service_id`;
  payer-auth/ownership/`regen_count` cap don't regress.
- **`GET /api/services`:** returns `publicRegistry()` with a stable shape.

Goal: keep the existing 159 tests green + add registry/services/dispatch tests.
Run `npm test` and confirm before claiming done (CLAUDE.md: evidence before done).

## 9. Out of scope (future specs)

- Non-thread output shapes (LinkedIn post, blog outline, cold email) and their
  renderers.
- Multi-tenant marketplace (third-party providers, per-provider payout, on-chain
  routing).
- Dropping the retained legacy thread columns from `invoices`.
