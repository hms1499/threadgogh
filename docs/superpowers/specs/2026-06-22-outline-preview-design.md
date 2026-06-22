# Outline preview before payment

**Date:** 2026-06-22
**Status:** Approved (design)

## Problem

A user paying per generation only sees the free hook (tweet 1) before paying. The
rest of the thread is invisible until after payment, so the purchase feels like
"buying blind" — the single biggest objection to converting. We want a stronger
free preview that shows where the whole thread is going, without giving away the
paid content or inflating server cost.

## Goal

Before payment, show the hook (clear, as today) **plus a locked outline** — one
short title per tweet for the full thread — so the buyer can see the structure they
are paying to unlock. The paid result must follow the previewed outline so the
preview is trustworthy.

## Decisions (from brainstorming)

- **Outline, not real tweet text.** Locked items are short titles, generated cheaply.
  Real tweet bodies are produced only after payment. (Avoids both the LLM cost of a
  full generation for non-buyers and the DOM-leak of blurring real text client-side.)
- **Outline is binding.** The outline is stored on the invoice and passed into thread
  generation as the skeleton, so paid tweets follow the previewed points.
- **Scope: chained services only** — `x-thread` and `repurpose-thread`. `hot-takes`
  is out of scope (independent short takes ≈ full content; an outline would leak it).
  It keeps its current hook-only preview.
- **One LLM call.** Hook + outline are produced in a single call at quote time, so
  cost stays ~flat versus today's single hook call and the two stay coherent.

## Architecture

### Data flow

```
POST /api/generate (no invoiceId)         ── quote branch ──
  def.generatePreview(params)  → { hook, outline[] }   (1 LLM call, may degrade)
  createInvoice(... preview_hook, preview_outline)
  402 → { ..., previewHook, previewOutline }

client renders: hook (clear) + outline 2..N (locked) + CTA "Pay to unlock"

POST /api/generate (with invoiceId, after pay) ── generate branch ──
  def.generate(params, { previewHook, previewOutline })
  → full thread follows the outline
```

### Components

**1. `ServiceDef` interface (`src/lib/services/types.ts`)**

- New type: `type PreviewResult = { hook: string | null; outline: string[] | null };`
- `generatePreview(p: P): Promise<PreviewResult>` (was `Promise<string | null>`).
- `GenCtx` gains `previewOutline: string[] | null` (alongside existing `previewHook`).
- `x-thread` and `repurpose-thread` return `{ hook, outline }`; `hot-takes` returns
  `{ hook, outline: null }`.

**2. LLM layer (`src/lib/generate-thread.ts`)**

- New `generateHookAndOutline(brief, tone, length, language?)` → one call returning
  JSON `{"hook": "...", "outline": ["...", ...]}` with `length` outline items;
  `outline[0]` is the point the hook covers. `brief` is the topic (x-thread) or a
  source excerpt (repurpose-thread).
- New `parseHookAndOutline(raw)` parser: tolerant of code fences; pads/trims the
  outline to exactly `length` items; throws on unrecoverable output so the caller can
  degrade.
- `generateThread` gains `opts.outline?: string[] | null`. When present, the prompt
  instructs the model to follow the outline (one tweet per point), combined with the
  existing `firstTweet` (= hook = tweet 1) behaviour: tweet 1 is the given hook
  (`outline[0]`), and the remaining tweets it writes follow `outline[1..N-1]` in order.

**3. Persistence**

- Migration `frontend/supabase/migrations/0008_invoices_preview_outline.sql`:
  `alter table invoices add column preview_outline jsonb;` (nullable).
- `src/lib/invoices.ts`: add `preview_outline: string[] | null` to `Invoice` and write
  it in `createInvoice`.

**4. Route (`src/app/api/generate/route.ts`)**

- Quote branch: call `def.generatePreview(params)` inside try/catch; on any failure
  degrade to `{ hook: null, outline: null }` (never block the quote — same posture as
  today's `generate.preview_hook_failed`). Store both, return `previewOutline` in the
  402 body.
- Generate branch: build `ctx = { previewHook: invoice.preview_hook, previewOutline:
  invoice.preview_outline }`.

**5. UI**

- New component `src/components/OutlinePreview.tsx`: renders the hook clear, then
  outline items `2..N` as locked rows (lock icon / muted "Van Gogh" styling), plus a
  CTA "Pay X STX to unlock the full thread". Rendered only while `thread.length === 0`.
- `page.tsx`: `Quote` type + state gain `previewOutline: string[] | null`; replace the
  inline free-hook block with `OutlinePreview` (which falls back to hook-only when
  `previewOutline` is null/empty).

## Error handling & degradation

- Outline generation failure or null → fall back to the current hook-only preview; no
  locked list shown. The quote must never fail because of the outline.
- Existing graceful-degrade logging pattern (`log.warn`) is reused.

## Testing

- `parseHookAndOutline`: valid JSON; missing fields; wrapped in ``` fences; wrong item
  count (pad/trim to `length`); garbage → throws.
- `generateThread`: when `opts.outline` is set, the LLM prompt contains the outline
  points (mock `callLlm`, assert on the system/user message).
- `generatePreview`: `x-thread` and `repurpose-thread` return an outline of the
  requested length; `hot-takes` returns `outline: null`.
- Route: quote stores and returns `previewOutline`; degrades to null when
  `generatePreview` throws; generate branch passes `previewOutline` into `ctx`.
- `OutlinePreview` render: correct number of locked rows + CTA; hook-only fallback when
  outline is null.

## Out of scope (YAGNI)

- Blurred-image rendering or per-tweet reveal animations.
- Outline preview for `hot-takes`.
- Any change to pricing or the payment contract.
