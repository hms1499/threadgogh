# Public Thread Pages (`/t/[slug]`)

**Date:** 2026-06-24
**Status:** Approved design — ready for implementation plan

## Goal

Give every generated thread an opt-in, shareable public URL. Today threads live
only inside the single-page app; there is no permalink. Public pages create a
viral loop (each shared thread advertises the product), social proof, and SEO —
and fit the no-account model because a public page needs no auth to read.

## Decisions (settled during brainstorming)

- **Privacy model: opt-in.** Threads are private by default. A thread becomes
  public only when its owner clicks "Share".
- **Share creation requires a wallet signature.** Reuse `authenticateAddress`
  (same as `/api/history` and `/api/regenerate`); the signer must match the
  generation's `payer_address`.
- **Public identifier is a separate share slug, not `invoice_id`.** `invoice_id`
  is a secret in the regenerate flow and reveals the payment linkage; it must
  never appear in a public URL.
- **Storage: column on `generations`** (chosen Approach A over a separate
  `shares` table). NULL slug = private.
- **OG image: dynamic per thread** via `ImageResponse`, with a static fallback if
  the modified Next.js build does not support the API.

## Architecture

### 1. Data model — migration `0009`

Add two columns to `generations`:

- `share_slug TEXT UNIQUE` — NULL = private (not shared); non-null = public.
- `shared_at TIMESTAMPTZ` — when the thread was shared.

The `UNIQUE` constraint provides the lookup index. NULL slugs never collide and
never match a public lookup.

Slug format: `crypto.randomBytes(16).toString('base64url')` (~22 chars,
URL-safe, unguessable). Unrelated to `invoice_id`.

### 2. Lib — `src/lib/share.ts`

Three pure, independently-testable functions:

- `createShare(invoiceId, address)` — verify `generation.payer_address === address`;
  mint a slug. Idempotent: if already shared, return the existing slug. Returns
  `{ slug }`.
- `revokeShare(invoiceId, address)` — set `share_slug = NULL` (and `shared_at = NULL`)
  for the owner's generation. Honors opt-in by allowing un-share.
- `getGenerationBySlug(slug)` — read the generation for the public page. A NULL
  slug never matches.

Ownership checks mirror the existing `regenerate` pattern (authenticate to an
address, compare against the on-chain `payer_address` stored on the generation).

### 3. API — `src/app/api/share/route.ts`

- `authenticateAddress(req, body)` → address (reused from history/regenerate).
- `POST` — validate `invoiceId` against `/^[0-9a-f]{64}$/`, call `createShare`,
  return `{ slug, url }`. Apply session cookie on first sign-in (same as the
  other authenticated routes).
- `DELETE` — call `revokeShare`.
- Errors: `400` (malformed id), `401` (unauthenticated), `403` (signer is not the
  payer), `404` (no generation for that invoice).

### 4. Public page — `src/app/t/[slug]/page.tsx` (Server Component)

- `getGenerationBySlug(slug)`; if null → `notFound()` (404).
- Load `topic`/`params` from the invoice and the service label from
  `publicRegistry()`.
- Render:
  - Header: service label + topic.
  - Thread: reuse `TweetCard`.
  - On-chain badge: "Paid with STX/sBTC on Stacks" + a link to the tx on the
    explorer.
  - CTA: "Create your own thread" → `/`.
  - Small client island: Copy button + open `PostThreadModal`.
- `generateMetadata()` for title/description and to point at the OG image.

> **Constraint:** This Next.js is modified. Before writing any page/route/OG code,
> read the relevant guide under `frontend/node_modules/next/dist/docs/` per
> `frontend/AGENTS.md`. Async `params`, metadata, and route conventions may differ
> from training data.

### 5. Dynamic OG image — `src/app/t/[slug]/opengraph-image.tsx`

- Use `ImageResponse` (`next/og`) to render the hook (first tweet) + ThreadGogh
  branding.
- **Verify the API works on the modified Next.js build first.** If unsupported,
  fall back to a static OG image rather than blocking the feature.

### 6. Main-flow UI — `ShareButton` (client component)

Placed next to a freshly generated thread in `page.tsx`. Signs with the wallet →
`POST /api/share` → shows the resulting link with a copy affordance and a
"shared / your link" state.

### 7. Explorer helper

Add `explorerTxUrl(txId)` to `lib/config`, resolving testnet vs mainnet from
`NEXT_PUBLIC_STACKS_NETWORK` (e.g. `https://explorer.hiro.so/txid/{txId}?chain=testnet`).

## Privacy

The public page exposes only: `thread_content`, the service label, the topic, the
token, and a link to the tx (already public on-chain). It does **not** expose
`invoice_id`, does not surface sensitive params, and does not display
`payer_address` directly.

## Error handling

- `/api/share`: `400` malformed id, `401` unauthenticated, `403` not owner,
  `404` no generation.
- Public page: unknown or unshared slug → `notFound()` (404).
- OG image: missing data → static fallback image.

## Testing (vitest, following existing `__tests__` patterns)

- `share.ts`: idempotent mint, wrong-owner rejected, `getGenerationBySlug`.
- `/api/share`: owner mint OK, wrong-owner `403`, unauthenticated `401`,
  malformed id `400`; DELETE revokes.
- Public page: renders a shared generation; `404` for unknown/unshared slug.

## Out of scope (YAGNI — revisit later)

- View counts / analytics.
- Referral / revenue split.
- A normalized `shares` table (upgrade path if the above are needed).
