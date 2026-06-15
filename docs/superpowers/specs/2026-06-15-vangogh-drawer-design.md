# Van Gogh treatment for the history drawer — design

Date: 2026-06-15
Scope: restyle the history Drawer (added earlier today) so it matches the app's
Van Gogh "museum" aesthetic instead of stock Ant Design. Consistency pass ① — Drawer
only. No logic change; CSS + a small JSX tweak.

## Problem

The history Drawer renders with default Ant Design surfaces (flat elevated panel,
default close icon, plain mask). It is the one chrome that breaks the hand-painted
look established by `.vg-card`, `.vg-frame`, `.vg-plate`, etc.

## Design

Reuse existing Van Gogh ingredients — no new visual vocabulary:
`var(--vg-card)`, `var(--vg-border)`, `var(--vg-star)`, the `.vg-card` canvas-grain
SVG data-URI, and `.vg-plate` (gold italic serif).

### `page.tsx`

- Title becomes `<span className="vg-plate" style={{ fontSize: 15 }}>Your threads</span>`.
- Attach part-scoped classes via the Ant 6 `classNames` prop:
  `{ content: 'vg-drawer__content', header: 'vg-drawer__header', body: 'vg-drawer__body', mask: 'vg-drawer__mask' }`.

### `globals.css` (new rules)

- `.vg-drawer__content` — `var(--vg-card)` background + the canvas-grain SVG (same as
  `.vg-card`) + `border-left: 1px solid var(--vg-border)` + blur. Turns the panel into
  woven canvas.
- `.vg-drawer__header` — transparent background so the grain shows; `border-bottom`
  in muted gold; a thin gold accent line on top (`inset 0 2px 0 var(--vg-star)`).
- `.vg-drawer__content .ant-drawer-close` — gold (`var(--vg-star)`), brighter on hover.
  (The close icon is the one Ant internal we reach into; consistent with the existing
  `!important` overrides in `.vg-card`.)
- `.vg-drawer__body` — transparent, keep comfortable padding.
- `.vg-drawer__mask` — deeper night tint `rgba(8, 14, 28, 0.6)`.

Mostly static; the global `prefers-reduced-motion` guard already covers the app.

## Scope guard

Drawer only. Toasts/modals/tooltips are out of scope (a later extension of ① if
wanted).

## Verification

`tsc --noEmit` + `eslint`. Because this is purely visual, verify the real result:
`npm run dev` and a Playwright screenshot of the opened Drawer (sign-in state). To
capture it without a browser wallet, temporarily force an address + `historyOpen` in
the working tree for the screenshot only, then revert — the committed code keeps the
address gate.

## Commit

Single commit: `style(ui): van gogh treatment for the history drawer`.
