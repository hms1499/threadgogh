# Share Backlink — Design

**Date:** 2026-06-26
**Status:** Approved, ready for implementation plan

## Problem

The product is in production but top-of-funnel is the bottleneck: 21 total quotes,
9 paid, 0 stuck — a healthy 42.9% conversion on a flow almost nobody has entered.
The conversion machine works; the issue is that almost no one arrives.

The sharing infrastructure (`/t/[slug]` public pages + dynamic OG images) is built,
but the artifact that actually travels — the thread posted/copied to X — carries
**zero attribution**. Today:

- `PublicThreadActions.tsx:18` — Copy writes `thread.join('\n\n')`, no link.
- `PostThreadModal.tsx:34` — posts each tweet's raw text, no backlink on the last.

So a great thread spreads on X with no indication it was made with ThreadGogh and
no path back. The viral loop dies at the payload. The page-level CTA
("Create your own thread →", `t/[slug]/page.tsx:59`) only converts people who
already landed on `/t/[slug]` — but most people see the thread *on X*, never there.

## Goal

Turn every thread copied or posted from ThreadGogh into a funnel entry by appending
a **removable, default-on credit** as a **separate final tweet** (never mixed into
the paid content). Small change, highest-leverage for the current stage.

## Decisions (settled during brainstorming)

- **URL target (option A):** use the most specific URL available.
  - `/t/[slug]` page: deep-link `…/t/<slug>`.
  - Main page: if shared this session (deep link in state) use it; else homepage.
- **Credit text (option A):**
  `🧵 Made with ThreadGogh — generate your own X thread, pay-per-thread on Stacks 👇 {url}`
- **Toggle (option A):** a single `includeCredit` checkbox next to Copy/Post,
  **default on**, controlling both Copy and Post-to-X consistently. One source of truth.
- The credit is **its own final tweet**, never appended into a paid tweet's text.

## Architecture & Data Flow

Pure logic lives in `lib/postToX.ts` (already the home of pure, unit-tested
client helpers). UI components only toggle a boolean and concatenate.

```
toggle includeCredit (default true)
        │
        ├─ Copy:  thread.join('\n\n')  + (on ? '\n\n' + creditTweet : '')
        └─ Post:  [ ...numbered tweets, (on ? creditTweet : —) ]  ← credit = separate final step
```

## Components & Changes

### `lib/postToX.ts` (add two pure helpers)

- `creditUrl(slug?: string | null): string`
  → `https://${APP_DOMAIN}` + (`slug` ? `/t/${slug}` : `''`).
  `APP_DOMAIN` comes from `lib/config.ts` (bare domain, no protocol — prepend `https://`).
- `creditTweet(url: string): string`
  → `🧵 Made with ThreadGogh — generate your own X thread, pay-per-thread on Stacks 👇 ${url}`

Both pure; no DOM, no env reads beyond the already-resolved `APP_DOMAIN` constant.

### `PostThreadModal.tsx`

- Add optional prop `credit?: string | null`.
- When non-null, the walkthrough array is `[...withThreadNumbers(thread, chained), credit]`
  — the credit is appended **after** numbering so the real thread's `i/n` markers stay honest.
- The credit step is labeled distinctly (e.g. "ThreadGogh link — optional") instead of
  "Tweet i/n", so the user understands it's a separate, optional reply.
- Opening it reuses the existing `intentUrl(credit)`.

### `PublicThreadActions.tsx` (public `/t/[slug]`)

- Add prop `slug: string`.
- Add `includeCredit` state (default `true`), rendered as an Ant `Checkbox` next to the buttons.
- Copy appends `'\n\n' + creditTweet(creditUrl(slug))` when on.
- Pass `credit={includeCredit ? creditTweet(creditUrl(slug)) : null}` to `PostThreadModal`.
- `t/[slug]/page.tsx` passes `slug` down (it already has it from params).

### `app/page.tsx` (main generation page)

- Add the same `includeCredit` toggle (default `true`) next to "Copy all" / Post.
- "Copy all" (`page.tsx:430`) appends the credit when on.
- Pass `credit` to `PostThreadModal` (`page.tsx:468`).
- URL = existing `shareUrl` state (`page.tsx:191`, a full deep link set after sharing)
  when present, else `creditUrl()` (homepage). Reuses existing state — no new slug state.

## Edge Cases

- **280-char limit:** template A is ~95 chars + URL → safely under 280. No truncation.
- **Unchained service (hot-takes):** credit is still a separate final tweet, unnumbered — consistent.
- **Toggle off:** no credit step in either Copy or Post.
- **SSR safety:** `creditUrl` uses `APP_DOMAIN` (not `window.location`), so it is safe
  to compute on the server-rendered `/t/[slug]` page.

## Testing

- Unit tests in the existing `postToX` test file:
  - `creditUrl(slug)` → `https://<APP_DOMAIN>/t/<slug>`.
  - `creditUrl()` / `creditUrl(null)` → `https://<APP_DOMAIN>` (homepage, no trailing `/t/`).
  - `creditTweet(url)` → contains the URL and is `< 280` chars.
- No heavy UI tests — matches the repo's convention of testing pure logic.

## Out of Scope (YAGNI)

- Persisting credit-on/off preference across sessions.
- Per-thread or per-service custom credit text.
- Tracking click-throughs / UTM attribution (can follow once the loop exists).
- Forcing share-before-post (rejected: adds friction where we need less).
