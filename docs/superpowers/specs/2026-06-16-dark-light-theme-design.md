# Dark / Light Theme — Design

**Date:** 2026-06-16
**Status:** Approved (design), pending implementation plan

## 1. Goal

Add a professional dark/light theme toggle to ThreadGogh. The app is currently
**dark-only**, built entirely around the "Van Gogh · Starry Night" identity
(`color-scheme: dark`, AntD `darkAlgorithm` fixed, and ~50 hardcoded dark colors
across `globals.css`, `page.tsx`, and 5 components).

Light mode gets its own coherent identity — **Van Gogh "Sunflowers"**: a warm
cream-yellow daytime counterpart to the Starry Night night. The two modes form a
matched pair (night sky ↔ sunflower field) that share the same gold/amber accent,
so switching feels seamless rather than like two different apps.

## 2. Decisions (locked)

| Decision | Choice |
|----------|--------|
| Light identity | **Sunflowers** — warm cream-yellow background |
| Default mode | **Follow OS** (`prefers-color-scheme`); fall back to dark if unknown |
| Persistence | Remember the user's explicit choice in `localStorage` (`tg-theme`) |
| Override precedence | Stored user choice > OS preference. Once user toggles, stop following OS |
| Toggle UI | **Icon button ☾/☀**, 2-state, in the hero top-right Flex next to wallet |
| Accent trajectory | Keep the gold/amber brand accent (`#f5d76e` / `#e8900a`) in both modes |

## 3. Architecture

### 3.1 Theme state layer (new)

`src/theme/ThemeContext.tsx` — a client React context exposing
`{ mode: 'light' | 'dark', toggle: () => void }`.

- **Init:** read `localStorage['tg-theme']`. If `'light'`/`'dark'` → use it.
  Otherwise resolve from `matchMedia('(prefers-color-scheme: dark)')`.
- **OS sync:** while the user has *not* made an explicit choice, listen to the
  media query and follow OS changes live. After an explicit toggle, stop following.
- **Apply:** on every resolved value, set `document.documentElement.dataset.theme`
  (`'light'` or `'dark'`) so CSS variables switch.
- **Toggle:** flip mode, persist to `localStorage`, set `data-theme`.

The OS/storage resolution logic is extracted into a **pure helper**
(`resolveInitialMode(stored, prefersDark)` and a small reducer/`nextMode`) so it
can be unit-tested without a DOM.

### 3.2 No-FOUC inline script

`layout.tsx` injects a tiny blocking `<script>` in `<head>` that runs before
first paint:

```js
// reads localStorage tg-theme or matchMedia, sets html[data-theme] + color-scheme
```

This prevents the dark→light flash on load. The script is the single source of
the *initial* `data-theme`; `ThemeContext` then takes over for runtime changes.
Keep it inline and dependency-free.

### 3.3 AntD reactive theming

- `src/theme/themeConfig.ts` exports **two** configs:
  - `darkTheme` — current config unchanged (`theme.darkAlgorithm` + Starry Night tokens).
  - `lightTheme` — `theme.defaultAlgorithm` + Sunflowers tokens (cream surfaces,
    warm brown text, gold/amber accent darkened enough for AA contrast).
- `src/app/providers.tsx` becomes a context consumer: it picks `darkTheme` /
  `lightTheme` by `mode` and passes it to `ConfigProvider`. `ThemeProvider` wraps
  `Providers` so both AntD and the toggle read one state.

### 3.4 CSS variable tokenization (the large piece)

`globals.css`:

- Expand `:root` into the full semantic token set (dark defaults). Keep existing
  `--vg-*` names; add the ones currently hardcoded, e.g.:
  `--vg-text-strong`, `--vg-text-soft`, `--vg-glass-bg`, `--vg-hero-scrim`,
  `--vg-frame-gold` (gold is shared but named for clarity), `--vg-body-grad`.
- Add `html[data-theme="light"] { … }` overriding each token with Sunflowers values.
- `color-scheme` set per theme (`dark` vs `light`).
- Replace hardcoded rgba/hex in `globals.css` **and** in components with these
  variables, so a single attribute flip restyles everything.

Components to detoxify (hardcoded color counts at design time):
`page.tsx` (24), `EmptyGallery.tsx` (14), `VanGoghLoader.tsx` (10),
`TweetCard.tsx` (9), `ThreadForm.tsx` (1), `PaymentStatus.tsx` (1).
`HistoryPanel.tsx` and `AnimatedCounter.tsx` already have none.

### 3.5 Toggle component (new)

`src/components/ThemeToggle.tsx` — icon button rendering ☾ (when light, click → dark)
or ☀ (when dark, click → light). Placed inside the existing hero top-right `Flex`
(before History/wallet). Requirements: `aria-label`/`title`, keyboard focusable
(inherits the global `:focus-visible` ring), animated icon swap (rotate + fade)
gated by `prefers-reduced-motion`.

## 4. Light-mode visual identity (Sunflowers)

- **Body:** warm cream gradient (`#faf3dd` → `#f4e7c2`) with a few sunflower-toned
  radial glows replacing the night swirls. Star field hidden in light (or a very
  faint pollen-mote texture). Brush-stroke overlay recolored to low-opacity amber/brown.
- **Hero:** light mode swaps the painting to `public/sunflowers.jpg` with a light
  cream bottom scrim; title text flips to deep brown for legibility. Dark keeps
  `starry-night.jpg`. Both driven by `data-theme`, no JS image swap needed if done
  via CSS background on the `.vg-hero` layer.
- **Cards / frame:** translucent cream glass surfaces; the **gold frame stays** (reads
  well on both). Tweet canvas → warm off-white.
- **Gallery placard:** already uses `sunflowers.jpg`; lighten its scrim for light mode.
- **Accent:** gold/amber kept; nudged darker in light mode for AA text contrast.
- **A11y:** verify text contrast ≥ AA on cream surfaces; extend
  `prefers-reduced-motion` coverage to any new light-mode effects.

## 5. Files touched

**New:** `src/theme/ThemeContext.tsx`, `src/components/ThemeToggle.tsx`.

**Edited:** `src/app/layout.tsx` (no-FOUC script + provider nesting),
`src/app/providers.tsx` (reactive), `src/theme/themeConfig.ts` (two configs),
`src/app/globals.css` (token sets + light identity), `src/app/page.tsx`,
`src/components/TweetCard.tsx`, `EmptyGallery.tsx`, `VanGoghLoader.tsx`,
`PaymentStatus.tsx`, `ThreadForm.tsx` (hardcoded colors → variables).

## 6. Testing

- **Unit (Vitest):** the pure theme-resolution helper — stored choice beats OS,
  OS fallback when unstored, `nextMode` toggling, persistence write. No DOM needed.
- **Manual / visual:** run dev server, verify both modes, the toggle, no-FOUC on
  reload, OS-change following before first toggle, persistence after toggle, and
  reduced-motion. Webpack only (`npm run dev` / `npm run build` keep `--webpack`).

## 7. Out of scope (YAGNI)

- A third "Auto/System" UI state (still resolved silently; not a visible 3-way control).
- Per-component theme overrides beyond what's needed for parity.
- New artwork assets — reuse existing `starry-night.jpg` / `sunflowers.jpg`.
- Mainnet/theme-specific env changes.

## 8. Key constraints respected

- Webpack-only build flag preserved.
- No new provider/SDK; purely frontend styling + state.
- No changes to payment, contract, or server logic.
