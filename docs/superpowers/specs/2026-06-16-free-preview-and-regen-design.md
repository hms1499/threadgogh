# Free Hook Preview + Free Re-roll — Design

Date: 2026-06-16
Status: Approved (brainstorming)

## Goal

Lift two known drop-off points in ThreadGogh without breaking the core invariant
(**the on-chain receipt gates the full LLM output**):

1. **Free hook preview** — show the first tweet (the hook) for free *before* payment,
   so users aren't paying blind.
2. **Free re-roll** — after paying, let the user regenerate the whole thread a limited
   number of times at no extra charge, so one purchase yields a usable result instead of
   a single dice roll.

Both ship as small, independent increments. Feature #1 and #2 do not depend on each
other and can be built/merged separately.

## Non-goals (YAGNI)

- No per-tweet editing or tone/length changes on re-roll — whole-thread re-roll only.
- No blurred full-thread preview — hook only.
- No new payment paths. Pricing, receipts, and the `pending → generating → consumed`
  machine are unchanged.
- No session-signed gating on re-roll (knowledge of the 64-hex `invoiceId` + an N-limit
  is the gate for v1). Session auth is noted as optional future hardening.

---

## Feature #1 — Free hook preview

### Flow

1. `POST /api/generate` **branch 1 (quote)** currently returns HTTP 402 without calling
   the LLM. Add: after `createInvoice`, call `generateHook(topic, tone)` → a single
   tweet. Store it in a new column `invoices.preview_hook` and return it in the 402
   payload as `previewHook`.
2. The client renders the hook beneath the form with a CTA: "Pay {price} to unlock the
   full thread."
3. On redeem (**branch 2**), pass the stored `preview_hook` to `generateThread` as a
   fixed tweet #1; the LLM only writes tweets 2..N continuing from it. This keeps the
   preview honest (what you saw *is* tweet #1) and avoids paying the LLM twice for the
   hook.

### Code changes

- **`lib/generate-thread.ts`**
  - Add `generateHook(topic, tone): Promise<string>` — a cheap single-tweet prompt
    (strong hook, < 270 chars, same language as topic). Returns one string.
  - Extend `generateThread(topic, tone, length, opts?)` with optional
    `opts.firstTweet`. When provided, the system/user prompt states "Tweet 1 is already
    written: '<hook>'. Write tweets 2..N continuing it." The function prepends the fixed
    hook to the parsed array and returns `length` tweets total. The 270-char clamp still
    applies to generated tweets; the fixed hook is passed through as-is (already clamped
    when generated).
- **`lib/invoices.ts`**
  - `Invoice` type gains `preview_hook?: string | null`.
  - `createInvoice(topic, tone, length, previewHook)` stores `preview_hook`.
- **`app/api/generate/route.ts`**
  - Branch 1: call `generateHook`, persist via `createInvoice`, return `previewHook` in
    the 402 body.
  - Branch 2: read `invoice.preview_hook` and pass `{ firstTweet: invoice.preview_hook }`
    to `generateThread` (fall back to a plain generate if the column is null, e.g. a
    pre-migration invoice).
- **Migration** `frontend/supabase/migrations/0002_invoices_preview_hook.sql` — add
  nullable `preview_hook text`.
- **UI** (`page.tsx` + a small component): render `previewHook` + unlock CTA after the
  quote, before/around the existing payment status.

### Decisions

- Preview is generated **synchronously during quote** (adds ~1s to the 402 — acceptable
  for a single tweet).
- Abuse protection is intentionally minimal for v1 (default LLM is Groq free tier). A
  per-address rate limit can be added later if needed; called out, not built now.
- Hook generation failure must **not** block quoting: if `generateHook` throws, log it,
  store `preview_hook = null`, and still return the 402 quote (with no `previewHook`).
  Payment and full generation must keep working even if the preview LLM call fails.

### Error handling

- `generateHook` failure → degrade gracefully (quote still returned, no preview).
- Branch 2 with `preview_hook = null` → generate the full thread normally (no fixed
  tweet 1). Backwards-compatible with invoices created before the migration.

---

## Feature #2 — Free re-roll within session

### Flow

1. Once a thread exists (invoice `consumed`, generation row present), the "Your thread"
   block shows a **"Regenerate"** button with the remaining free count (e.g. "2 free
   left").
2. The button calls a new endpoint `POST /api/regenerate` with `{ invoiceId }`.
3. Server checks: invoice exists and is `consumed`; a generation row exists (proves
   payment already happened); `regen_count < MAX_FREE_REGENS`. If all pass, it calls
   `generateThread(topic, tone, length)` — a **fully fresh** generation (new hook, tweet
   1 not pinned), overwrites `generations.thread_content`, and increments `regen_count`.
4. Response: `{ thread, regenRemaining }`. When the limit is hit, return HTTP 429 with a
   clear message and `regenRemaining: 0`.

### Why a separate endpoint

`/api/generate` is already a payment state machine (claim/lock/receipt verification).
Re-roll is a distinct post-payment operation. A separate `app/api/regenerate/route.ts`
keeps each route single-purpose and independently testable.

### Concurrency

Re-roll uses a compare-and-swap update: `UPDATE generations SET thread_content=…,
regen_count = regen_count + 1 WHERE invoice_id = … AND regen_count = <value just read>`.
Two simultaneous clicks can't exceed N or clobber each other — the loser's update
matches zero rows and is rejected (client can retry or is told the limit is reached).

### Code changes

- **Migration** `frontend/supabase/migrations/0003_generations_regen_count.sql` — add
  `regen_count int not null default 0`.
- **`lib/config.ts`** — add `MAX_FREE_REGENS = 3`.
- **`lib/invoices.ts`** — add `regenerateGeneration(invoiceId, newThread, expectedCount)`
  performing the CAS update; returns the updated row or null on CAS miss. `Generation`
  type gains `regen_count`.
- **`app/api/regenerate/route.ts`** — new POST route implementing the flow above.
- **UI** (`page.tsx`) — "Regenerate" button + remaining counter inside the "Your thread"
  block; wire to the new endpoint; update `thread` state and the counter from the
  response.

### Decisions

- `MAX_FREE_REGENS = 3`.
- Gate = knowledge of `invoiceId` + the N-limit. No session signature required for v1.
- Re-roll produces a fresh hook (tweet 1 is not pinned, unlike the first paid
  generation).

### Error handling

- Invoice not `consumed` / no generation → 404 or 409 (nothing to re-roll).
- `regen_count >= MAX_FREE_REGENS` → 429, `regenRemaining: 0`.
- LLM failure during re-roll → 500, **do not** increment `regen_count` (the user keeps
  their remaining free re-rolls); the existing thread stays intact.
- CAS miss (concurrent re-roll) → treat as "in progress / retry"; do not double-count.

---

## Build order

Two independent slices, each its own plan and small tasks:

1. **#1 hook preview** — migration → `generateHook` + `generateThread` opt → route
   branch 1 & 2 → UI.
2. **#2 re-roll** — migration → config + `regenerateGeneration` → new route → UI.

Each task should be the smallest shippable unit (per user request: "chia task càng nhỏ
càng tốt").

## Testing

- `generate-thread.test.ts`: `generateHook` returns one string; `generateThread` with
  `firstTweet` pins tweet 1 and returns `length` tweets.
- `generate` route test: branch 1 returns `previewHook`; hook failure still returns a
  402 quote; branch 2 reuses the stored hook.
- New `regenerate` route test: happy path overwrites thread + increments count; limit
  reached → 429; not-consumed → error; CAS miss handled.
- Existing tests must stay green.
