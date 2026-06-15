# Paint-sweep reveal for tweet cards — design

Date: 2026-06-15
Scope: upgrade the TweetCard entrance from the plain `tp-rise` slide-up to a
"paint-sweep" brushstroke reveal (roadmap item ②). TweetCard + CSS only.

## Current state

`TweetCard` already staggers: its outer div uses `tp-rise` (fade + translateY 14px)
with `animationDelay: index * 0.09s`. The stagger stays; only the *character* of each
card's entrance changes — from sliding up to being painted in.

## Design

Replace the `tp-rise` wrapper with a `.vg-paint` wrapper carrying two synchronized
layers.

### 1. Wipe — the brushstroke

`clip-path: inset(0 100% 0 0 round 7px)` → `inset(0 0 0 0 round 7px)`: the framed card
is revealed left→right like a brush pass, with a light fade. `round 7px` matches the
`.vg-frame` radius. The frame's drop shadow is clipped until the wipe completes
(acceptable — it settles in as the stroke finishes).

### 2. Wet-brush sheen

A gold streak `linear-gradient(105deg, transparent 38%, rgba(245,215,110,0.4) 50%,
transparent 62%)` sweeps across in the wipe direction (translateX −130% → +130%,
opacity 0→1→0). It lives on `.vg-frame__canvas`, which gets `overflow: hidden` so the
streak is clipped inside the canvas and never overflows or cuts the frame's outer glow.

### Stagger via CSS variable

The per-card delay must reach the sheen pseudo-element too, so it is passed as a custom
property rather than the `animationDelay` style:
`style={{ '--paint-delay': `${index * 0.1}s` }}` (cast `as React.CSSProperties`).
Both `.vg-paint` and the sheen `::after` read `animation-delay: var(--paint-delay)`
(custom properties inherit to descendants and pseudo-elements). Wipe duration ~0.7s.

### Reduced motion

The global `prefers-reduced-motion` guard (`* { animation: none !important }`) disables
both animations. Base (non-animated) states must be the visible end state: `.vg-paint`
has no clip-path in its base rule (card fully shown) and the sheen `::after` has base
`opacity: 0` (hidden). So reduced-motion users see the card immediately with no stray
streak.

## Scope

`TweetCard.tsx` + new rules/keyframes in `globals.css`. Threads from a fresh generation
and from a history selection both render TweetCard, so both get the effect.

## Verification

`tsc --noEmit` + `eslint`. The effect is temporal, so a single screenshot can't show
motion. Seed a few sample tweets in the working tree (temp, reverted after) to render
the thread, then a Playwright screenshot to confirm layout/frame integrity and a clean
console; attempt an early frame to glimpse the wipe. Real motion is best seen by running
`npm run dev`.

## Commit

Single commit: `style(ui): paint-sweep reveal for tweet cards`.
