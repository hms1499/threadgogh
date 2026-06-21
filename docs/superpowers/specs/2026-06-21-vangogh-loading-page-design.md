# Van Gogh Loading Page — Design

**Status:** Approved (design phase)
**Date:** 2026-06-21

## 1. Goal

Add an immersive Van Gogh–style "canvas being painted" loading experience in two
moments, sharing one visual language:

1. **App-open splash** — a full-screen painterly intro shown while the app loads
   its data, then fading into the page.
2. **Generation takeover** — a full-screen, interaction-blocking "painting" while
   the LLM writes the thread (`phase === 'generating'`), dissolving into the real
   thread once it lands.

This extends the existing Van Gogh aesthetic (`vg-hero`, `vg-gallery`, the inline
`VanGoghLoader`, per-tweet paint-reveal). It is a **display layer only** — it does
not touch the payment, generate, regenerate, or service-registry flows.

## 2. Approach

Pure SVG/CSS, one shared full-screen component reused for both moments. No new
dependencies; new keyframes live in `globals.css` under the `vg-` namespace; AntD
is used only for layout/typography. Reduced-motion is honored throughout.

Rejected alternatives:
- **Next.js `loading.tsx` for the splash** — `/` is a client component whose
  `services`/`stats` fetches run *after* mount, so a route-level `loading.tsx`
  (which only covers server render/navigation) would not cover the data fetch and
  could not implement "show until app ready."
- **Canvas/WebGL brush simulation** — heavier, mobile-jank risk, awkward with
  reduced-motion. Overkill (YAGNI).

## 3. Components

### `VanGoghCanvas` (new)
A `position: fixed` full-screen overlay rendering a framed Starry-Night scene built
from layered SVG paths brushed in via paint-wipe, over an animated star/cloud
background (reusing `vg-sky-flow` / `vg-kenburns` motifs).

Props:
- `label: string` — caption (e.g. "Painting your thread…").
- `tx?: string` — optional txid; renders a small explorer link (same construction
  as `PaymentStatus`).
- `fadingOut?: boolean` — drives the ~400ms fade-out before unmount.

Reduced-motion: renders the **finished** painted scene statically (no sweep/loop),
caption fades gently.

### `AppSplash` (new)
Wraps `VanGoghCanvas` for the app-open moment. Owns the "ready" condition, the cap
timer, the fade-out, and unmount.

### Integration in `page.tsx`
- Render `<AppSplash>` until `ready`.
- Render `<VanGoghCanvas>` overlay when `phase === 'generating'`.

### `VanGoghLoader` (existing) — retained
Still used for the `quoting` phase (small inline loader in `PaymentStatus`). The
`generating` phase now uses the full-screen takeover instead of the inline loader.

## 4. Behavior

### App-open splash
- `ready` becomes `true` when the **services fetch settles** (success *or* error —
  on error the page still shows the form/notice). `stats` is non-critical and does
  not gate the splash.
- A **2500ms cap** timer forces `ready = true` so a slow/hung network never traps
  the user behind the splash.
- On `ready`: fade out ~400ms, then unmount. Shown on **every** page load (no
  sessionStorage persistence).

### Generation takeover
- Bound strictly to `phase === 'generating'`. Full-screen `fixed`, locks body
  scroll (`overflow: hidden` while open) and blocks pointer interaction.
- Shows caption "Painting your thread…" + small tx link.
- When the phase leaves `generating` (→ `done` / `error` / `recover` / 202-retry),
  the overlay fades ~400ms and unmounts; the existing per-tweet paint-reveal then
  takes over (visual continuity).
- **Safety:** because it is bound to `generating`, it cannot hang forever — the
  existing flow always transitions to `recover`/`error`/`done`, and the overlay
  follows the phase out. No cancel button needed.

### Reduced motion
`@media (prefers-reduced-motion: reduce)`: drop all sweep/loop animation; show the
completed painting statically with a gently-fading caption.

## 5. Constraints

- No new dependencies; pure SVG/CSS. New keyframes namespaced `vg-` in
  `globals.css`.
- Does not modify payment / generate / regenerate / registry logic — additive
  display layer only.
- Webpack-only build unchanged.

## 6. Testing

- **Unit (Vitest):** a pure helper `splashDone(servicesSettled: boolean,
  elapsedMs: number, capMs: number): boolean`. Cases:
  - not settled & below cap → `false`
  - settled (any elapsed) → `true`
  - elapsed ≥ cap → `true`
- **Components / integration** (`VanGoghCanvas`, `AppSplash`, `page.tsx` wiring):
  verified by `npm run build` + manual smoke (per repo convention: no `.tsx` tests).

### Manual smoke checklist
- Reload app → splash paints in, fades out once services load (and within ~2.5s on
  a throttled network).
- Generate a thread → full-screen takeover during `generating`, blocks interaction,
  shows tx link, dissolves into the paint-revealed thread on completion.
- Force a generation error / recover path → overlay dismisses to reveal the
  error/recover UI (not stuck).
- `prefers-reduced-motion: reduce` → static painted scene, no sweeping motion.

## 7. Out of scope

- Persisting/throttling the splash across sessions.
- Full-screen takeover for `quoting` / `awaiting-signature` / `confirming` (those
  keep the existing inline `PaymentStatus`).
- Literal rendering of the user's tweet text during the painting (content isn't
  known until the LLM returns; the painting is decorative, then hands off).
