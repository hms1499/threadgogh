# Dark / Light Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a professional dark/light theme toggle (Starry Night ↔ Sunflowers) driven by one shared state, with OS-default + persisted user choice and no flash-of-wrong-theme.

**Architecture:** A pure resolver decides the mode (stored choice > OS). A client `ThemeProvider` applies `html[data-theme]` and feeds AntD the right token set; an inline `<head>`/top-of-body script sets the attribute before first paint. All theme-dependent colors become CSS variables (`--vg-*`) with a `html[data-theme="light"]` override block; complex multi-layer backgrounds get per-theme override rules. Decorative SVG illustrations keep their artwork colors — only UI chrome (text, surfaces, borders, buttons, the hero/gallery art) is theme-aware.

**Tech Stack:** Next.js 16 (App Router, **webpack only**), React 19, Ant Design 6 (`ConfigProvider` + algorithms), Vitest 4. No new dependencies.

> **Commit convention for this repo:** plain messages, **no** `Co-Authored-By` trailer (user preference). Commit directly on `main`.

---

## File Structure

**New files:**
- `frontend/src/theme/themeMode.ts` — pure, DOM-free mode logic (resolve/toggle/storage key). Unit-tested.
- `frontend/src/theme/__tests__/themeMode.test.ts` — unit tests for the resolver.
- `frontend/src/theme/ThemeContext.tsx` — client provider + `useTheme()` hook; applies `data-theme`, follows OS until user chooses.
- `frontend/src/components/ThemeToggle.tsx` — ☾/☀ icon button wired to `useTheme()`.

**Modified files:**
- `frontend/src/theme/themeConfig.ts` — export `darkTheme` + `lightTheme` from a shared base.
- `frontend/src/app/providers.tsx` — pick AntD theme by `mode`.
- `frontend/src/app/layout.tsx` — no-FOUC script + wrap with `ThemeProvider`.
- `frontend/src/app/globals.css` — semantic token layer, light override block, light identity rules, tokenize `.vg-plate`/`.vg-signature`, toggle icon CSS.
- `frontend/src/app/page.tsx` — replace hardcoded colors with tokens; mount `ThemeToggle`.
- `frontend/src/components/TweetCard.tsx`, `EmptyGallery.tsx`, `VanGoghLoader.tsx`, `PaymentStatus.tsx`, `ThreadForm.tsx` — hardcoded colors → tokens.

**Color token map** (used throughout component detox):

| Literal (dark) | Token |
|---|---|
| `#e8eaf6` text | `var(--vg-canvas)` |
| `#9fa8d4` text | `var(--vg-muted)` |
| `#8593cf` / `#7886c5` | `var(--vg-faint)` |
| `#6b74a0` | `var(--vg-faint)` |
| `#c9b85e` | `var(--vg-gold)` |
| `#f5d76e` | `var(--vg-star)` |
| `#7bc67e` | `var(--vg-success)` |
| `#e57373` | `var(--vg-error)` |
| `#fdfcf7` (hero title) | `var(--vg-on-art)` |
| `#f0eee8` (on gallery art) | `var(--vg-on-art)` |
| `#cdd3ee` (hero sub) | `var(--vg-on-art-soft)` |
| `rgba(205,211,238,0.6)` | `var(--vg-on-art-faint)` |
| `#9fb0e0` (gallery labels) | `var(--vg-on-art-faint)` |
| `rgba(8,14,28,0.55)` btn bg | `var(--vg-glass)` |
| `rgba(61,90,173,0.6)` btn border | `var(--vg-glass-border)` |
| `rgba(37,61,138,0.25)` pill bg | `var(--vg-pill-bg)` |
| `rgba(61,90,173,0.25)` pill border | `var(--vg-pill-border)` |

> All commands run from `frontend/`.

---

### Task 1: Pure theme-mode helper

**Files:**
- Create: `frontend/src/theme/themeMode.ts`
- Test: `frontend/src/theme/__tests__/themeMode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/theme/__tests__/themeMode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveInitialMode, nextMode, isThemeMode, THEME_STORAGE_KEY } from '../themeMode';

describe('themeMode', () => {
  it('stored choice wins over OS preference', () => {
    expect(resolveInitialMode('light', true)).toBe('light');
    expect(resolveInitialMode('dark', false)).toBe('dark');
  });

  it('falls back to OS when nothing stored', () => {
    expect(resolveInitialMode(null, true)).toBe('dark');
    expect(resolveInitialMode(null, false)).toBe('light');
  });

  it('ignores invalid stored values and uses OS', () => {
    expect(resolveInitialMode('purple', true)).toBe('dark');
    expect(resolveInitialMode('', false)).toBe('light');
  });

  it('toggles between the two modes', () => {
    expect(nextMode('dark')).toBe('light');
    expect(nextMode('light')).toBe('dark');
  });

  it('validates theme-mode strings', () => {
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('auto')).toBe(false);
    expect(isThemeMode(null)).toBe(false);
  });

  it('exposes the storage key', () => {
    expect(THEME_STORAGE_KEY).toBe('tg-theme');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- themeMode`
Expected: FAIL — cannot find module `../themeMode`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/theme/themeMode.ts`:

```ts
// Pure, DOM-free theme-mode logic so it can be unit-tested without a browser.
export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'tg-theme';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

// Explicit stored choice always wins; otherwise follow the OS preference.
export function resolveInitialMode(stored: string | null, prefersDark: boolean): ThemeMode {
  if (isThemeMode(stored)) return stored;
  return prefersDark ? 'dark' : 'light';
}

export function nextMode(mode: ThemeMode): ThemeMode {
  return mode === 'dark' ? 'light' : 'dark';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- themeMode`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/theme/themeMode.ts src/theme/__tests__/themeMode.test.ts
git commit -m "feat(theme): pure theme-mode resolver with tests"
```

---

### Task 2: Theme context provider

**Files:**
- Create: `frontend/src/theme/ThemeContext.tsx`

- [ ] **Step 1: Write the provider**

Create `frontend/src/theme/ThemeContext.tsx`:

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { THEME_STORAGE_KEY, isThemeMode, nextMode, resolveInitialMode, type ThemeMode } from './themeMode';

type ThemeContextValue = { mode: ThemeMode; toggle: () => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // SSR/first render defaults to dark (matches CSS :root). The effect below
  // reconciles with the value the no-FOUC script already applied.
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [userChose, setUserChose] = useState(false);

  // On mount, read storage + OS once to seed state (the inline script already
  // painted the right theme; this just syncs React to it).
  useEffect(() => {
    const stored = (() => {
      try { return localStorage.getItem(THEME_STORAGE_KEY); } catch { return null; }
    })();
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setUserChose(isThemeMode(stored));
    setMode(resolveInitialMode(stored, prefersDark));
  }, []);

  // Apply the resolved mode to <html> for the CSS variable switch.
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  // Follow OS changes only until the user makes an explicit choice.
  useEffect(() => {
    if (userChose) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setMode(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [userChose]);

  const toggle = useCallback(() => {
    setMode((current) => {
      const next = nextMode(current);
      try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
    setUserChose(true);
  }, []);

  return <ThemeContext.Provider value={{ mode, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/theme/ThemeContext.tsx
git commit -m "feat(theme): ThemeProvider context (OS default, persisted choice)"
```

---

### Task 3: Wire provider + no-FOUC script into layout

**Files:**
- Modify: `frontend/src/app/layout.tsx`

> Before editing, per `frontend/AGENTS.md`, skim the App-Router layout/metadata guide in `frontend/node_modules/next/dist/docs/` if anything about `<head>` placement is unclear. The script below only mutates `document.documentElement` (not React-managed nodes), so it does not cause a hydration mismatch as long as `data-theme` is NOT rendered in JSX.

- [ ] **Step 1: Add the no-FOUC script as the first child of `<body>` and wrap children with `ThemeProvider`**

In `frontend/src/app/layout.tsx`:

Add the import near the other imports:

```tsx
import { ThemeProvider } from '@/theme/ThemeContext';
```

Replace the `<body>` block:

```tsx
      <body>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
```

with:

```tsx
      <body>
        {/* Set the theme before first paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var s=localStorage.getItem('tg-theme');var m=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var e=document.documentElement;e.dataset.theme=m;e.style.colorScheme=m;}catch(_){}})();",
          }}
        />
        <ThemeProvider>
          <AntdRegistry>
            <Providers>{children}</Providers>
          </AntdRegistry>
        </ThemeProvider>
      </body>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(theme): no-FOUC init script + ThemeProvider in root layout"
```

---

### Task 4: Two AntD themes + reactive Providers

**Files:**
- Modify: `frontend/src/theme/themeConfig.ts`
- Modify: `frontend/src/app/providers.tsx`

- [ ] **Step 1: Rewrite `themeConfig.ts` to export `darkTheme` and `lightTheme`**

Replace the whole file `frontend/src/theme/themeConfig.ts` with:

```ts
import { theme, type ThemeConfig } from 'antd';

// ─── Dark · Starry Night ──────────────────────────────────────
const STAR_GOLD = '#f5d76e';
const NIGHT     = '#0d1427';

// ─── Light · Sunflowers ───────────────────────────────────────
const SUN_GOLD  = '#d99a0a';   // accent darkened for AA on cream
const CREAM     = '#faf3dd';

// Shared shape/typography tokens (theme-independent).
const baseToken: ThemeConfig['token'] = {
  borderRadius:    12,
  borderRadiusSM:  8,
  fontFamily:      'var(--font-sora), system-ui, sans-serif',
  fontFamilyCode:  'var(--font-mono), ui-monospace, monospace',
  fontSize:        15,
  controlHeight:   42,
  wireframe:       false,
};

export const darkTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...baseToken,
    colorPrimary:         STAR_GOLD,
    colorInfo:            STAR_GOLD,
    colorLink:            STAR_GOLD,
    colorLinkHover:       '#f7e190',
    colorBgBase:          NIGHT,
    colorBgContainer:     'rgba(13, 26, 62, 0.88)',
    colorBgElevated:      '#152050',
    colorBorder:          'rgba(61, 90, 173, 0.45)',
    colorBorderSecondary: 'rgba(37, 61, 138, 0.35)',
    colorText:            '#e8eaf6',
    colorTextSecondary:   '#9fa8d4',
    colorTextTertiary:    '#8593cf',
    colorTextPlaceholder: '#7886c5',
    colorSuccess:         '#7bc67e',
    colorWarning:         '#e8900a',
    colorError:           '#e57373',
  },
  components: {
    Button: {
      fontWeight:    600,
      controlHeight: 44,
      primaryShadow: '0 0 18px rgba(245, 215, 110, 0.35)',
      colorPrimaryHover: '#f7e190',
      colorPrimaryActive: '#d4b84a',
    },
    Card: {
      paddingLG:        22,
      colorBgContainer: 'rgba(13, 26, 62, 0.88)',
      colorBorderSecondary: 'rgba(61, 90, 173, 0.4)',
    },
    Segmented: {
      itemSelectedBg:    '#253d8a',
      itemSelectedColor: STAR_GOLD,
      itemColor:         '#9fa8d4',
      itemHoverColor:    '#e8eaf6',
      trackBg:           'rgba(10, 18, 40, 0.7)',
      borderRadius:      10,
      borderRadiusSM:    8,
    },
    Steps: {
      colorPrimary:   STAR_GOLD,
      colorText:      '#9fa8d4',
      colorTextLabel: '#9fa8d4',
    },
    Input: {
      paddingBlock:     11,
      colorBgContainer: 'rgba(8, 14, 28, 0.7)',
      colorBorder:      'rgba(61, 90, 173, 0.5)',
      hoverBorderColor: 'rgba(245, 215, 110, 0.5)',
      activeBorderColor: STAR_GOLD,
    },
    Alert: {
      colorInfoBg:     'rgba(37, 61, 138, 0.3)',
      colorInfoBorder: 'rgba(61, 90, 173, 0.5)',
      colorWarningBg:  'rgba(232, 144, 10, 0.15)',
      colorErrorBg:    'rgba(229, 115, 115, 0.15)',
    },
    Statistic: { contentFontSize: 24 },
    Tag: {
      defaultBg:    'rgba(37, 61, 138, 0.3)',
      defaultColor: '#9fa8d4',
    },
  },
};

export const lightTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...baseToken,
    colorPrimary:         SUN_GOLD,
    colorInfo:            SUN_GOLD,
    colorLink:            '#b8860b',
    colorLinkHover:       SUN_GOLD,
    colorBgBase:          CREAM,
    colorBgContainer:     'rgba(255, 250, 235, 0.86)',
    colorBgElevated:      '#fffdf5',
    colorBorder:          'rgba(154, 125, 46, 0.35)',
    colorBorderSecondary: 'rgba(154, 125, 46, 0.25)',
    colorText:            '#3a2f1a',
    colorTextSecondary:   '#6b5d3f',
    colorTextTertiary:    '#8a7a52',
    colorTextPlaceholder: '#a8986b',
    colorSuccess:         '#4e9a51',
    colorWarning:         '#c2740a',
    colorError:           '#c0504d',
  },
  components: {
    Button: {
      fontWeight:    600,
      controlHeight: 44,
      primaryShadow: '0 2px 12px rgba(217, 154, 10, 0.3)',
      colorPrimaryHover: '#e8a81e',
      colorPrimaryActive: '#b8860b',
    },
    Card: {
      paddingLG:        22,
      colorBgContainer: 'rgba(255, 250, 235, 0.86)',
      colorBorderSecondary: 'rgba(154, 125, 46, 0.3)',
    },
    Segmented: {
      itemSelectedBg:    '#f0dca0',
      itemSelectedColor: '#7a5e16',
      itemColor:         '#6b5d3f',
      itemHoverColor:    '#3a2f1a',
      trackBg:           'rgba(244, 231, 194, 0.8)',
      borderRadius:      10,
      borderRadiusSM:    8,
    },
    Steps: {
      colorPrimary:   SUN_GOLD,
      colorText:      '#6b5d3f',
      colorTextLabel: '#6b5d3f',
    },
    Input: {
      paddingBlock:     11,
      colorBgContainer: 'rgba(255, 252, 242, 0.9)',
      colorBorder:      'rgba(154, 125, 46, 0.4)',
      hoverBorderColor: 'rgba(217, 154, 10, 0.6)',
      activeBorderColor: SUN_GOLD,
    },
    Alert: {
      colorInfoBg:     'rgba(244, 231, 194, 0.6)',
      colorInfoBorder: 'rgba(154, 125, 46, 0.4)',
      colorWarningBg:  'rgba(194, 116, 10, 0.12)',
      colorErrorBg:    'rgba(192, 80, 77, 0.12)',
    },
    Statistic: { contentFontSize: 24 },
    Tag: {
      defaultBg:    'rgba(244, 231, 194, 0.7)',
      defaultColor: '#6b5d3f',
    },
  },
};
```

- [ ] **Step 2: Make `providers.tsx` reactive**

Replace `frontend/src/app/providers.tsx` with:

```tsx
'use client';

import { ConfigProvider, App as AntApp } from 'antd';
import { darkTheme, lightTheme } from '@/theme/themeConfig';
import { useTheme } from '@/theme/ThemeContext';

// ConfigProvider must wrap App so message/notification use the theme tokens (v6).
export function Providers({ children }: { children: React.ReactNode }) {
  const { mode } = useTheme();
  return (
    <ConfigProvider theme={mode === 'dark' ? darkTheme : lightTheme}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
```

- [ ] **Step 3: Type-check + existing tests still pass**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; all existing test suites pass.

- [ ] **Step 4: Commit**

```bash
git add src/theme/themeConfig.ts src/app/providers.tsx
git commit -m "feat(theme): dark + light AntD configs, reactive Providers"
```

---

### Task 5: Semantic CSS token layer (variables only)

**Files:**
- Modify: `frontend/src/app/globals.css` (the `:root` block, lines ~3–18)

- [ ] **Step 1: Extend `:root` with the new semantic tokens**

In `frontend/src/app/globals.css`, replace the `:root { … }` block (currently `color-scheme: dark;` through `--vg-border: …;`) with:

```css
:root {
  color-scheme: dark;
  --vg-night:   #0d1427;
  --vg-deep:    #080e1c;
  --vg-cobalt:  #1a2f6e;
  --vg-sky:     #253d8a;
  --vg-swirl:   #3d5aad;
  --vg-star:    #f5d76e;
  --vg-moon:    #f7e190;
  --vg-wheat:   #e8900a;
  --vg-canvas:  #e8eaf6;
  --vg-muted:   #9fa8d4;
  --vg-card:    rgba(13, 26, 62, 0.88);
  --vg-border:  rgba(61, 90, 173, 0.4);

  /* Semantic UI tokens (added for theming) */
  --vg-faint:        #8593cf;
  --vg-gold:         #c9b85e;
  --vg-success:      #7bc67e;
  --vg-error:        #e57373;
  --vg-glass:        rgba(8, 14, 28, 0.55);
  --vg-glass-border: rgba(61, 90, 173, 0.6);
  --vg-pill-bg:      rgba(37, 61, 138, 0.25);
  --vg-pill-border:  rgba(61, 90, 173, 0.25);

  /* Text that sits over the hero / gallery artwork */
  --vg-on-art:       #fdfcf7;
  --vg-on-art-soft:  #cdd3ee;
  --vg-on-art-faint: #9fb0e0;
}

/* ─── Light theme · Van Gogh "Sunflowers" ─────────────────────── */
html[data-theme="light"] {
  color-scheme: light;
  --vg-night:   #faf3dd;
  --vg-deep:    #f4e7c2;
  --vg-cobalt:  #e8d9a8;
  --vg-sky:     #e2c878;
  --vg-swirl:   #c98f2a;
  --vg-star:    #d99a0a;
  --vg-moon:    #b8860b;
  --vg-wheat:   #c2740a;
  --vg-canvas:  #3a2f1a;
  --vg-muted:   #6b5d3f;
  --vg-card:    rgba(255, 250, 235, 0.86);
  --vg-border:  rgba(154, 125, 46, 0.30);

  --vg-faint:        #8a7a52;
  --vg-gold:         #9a7d2e;
  --vg-success:      #4e9a51;
  --vg-error:        #c0504d;
  --vg-glass:        rgba(255, 248, 230, 0.62);
  --vg-glass-border: rgba(154, 125, 46, 0.42);
  --vg-pill-bg:      rgba(154, 125, 46, 0.15);
  --vg-pill-border:  rgba(154, 125, 46, 0.30);

  --vg-on-art:       #2c2410;
  --vg-on-art-soft:  #4a3f22;
  --vg-on-art-faint: #6b5a30;
}
```

- [ ] **Step 2: Sanity check the dev build compiles CSS**

Run: `npm run build`
Expected: build succeeds (webpack). No new errors from globals.css.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): semantic CSS token layer + light override block"
```

---

### Task 6: Light-mode identity rules + tokenize plate/signature + toggle CSS

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Point `.vg-plate` and `.vg-signature` at the gold token**

In `frontend/src/app/globals.css`, change the `color: #c9b85e;` line inside **both** `.vg-plate` and `.vg-signature` to:

```css
  color: var(--vg-gold);
```

(`.vg-plate` stays `font-size: 13px`; `.vg-signature` stays `font-size: 14px; opacity: 0.85`. Only the color line changes.)

- [ ] **Step 2: Append the light-identity overrides + toggle icon CSS at the end of `globals.css`**

Append to the end of `frontend/src/app/globals.css` (before nothing — it's the last block):

```css
/* ─── Light theme identity (Sunflowers daylight) ──────────────── */

/* Cream daylight background — warm sunflower glows, no night swirls. */
html[data-theme="light"] body {
  background-color: var(--vg-night);
  background-image:
    radial-gradient(circle 200px at 84% 10%, rgba(217, 154, 10, 0.18) 0%, transparent 70%),
    radial-gradient(ellipse 520px 300px at 15% 22%, rgba(244, 211, 130, 0.55) 0%, transparent 70%),
    radial-gradient(ellipse 600px 360px at 80% 68%, rgba(232, 196, 120, 0.45) 0%, transparent 70%),
    linear-gradient(170deg, #fbf4dc 0%, var(--vg-night) 50%, var(--vg-deep) 100%);
}

/* Daylight has no starfield, and the night brush-stroke overlay is hidden
   for a clean cream canvas. */
html[data-theme="light"] body::before,
html[data-theme="light"] body::after {
  display: none;
}

/* Hero shows Sunflowers in daylight, with a cream scrim so dark text reads. */
html[data-theme="light"] .vg-hero::before {
  background-image: url("/sunflowers.jpg");
  background-position: center 40%;
}
html[data-theme="light"] .vg-hero::after {
  background:
    linear-gradient(180deg, rgba(250, 243, 221, 0.05) 0%, rgba(250, 243, 221, 0.40) 52%, rgba(250, 243, 221, 0.94) 100%),
    linear-gradient(90deg, rgba(250, 243, 221, 0.55) 0%, transparent 55%);
}

/* Gallery placard: lighten the Sunflowers scrim for cream surfaces. */
html[data-theme="light"] .vg-gallery {
  border-color: rgba(194, 116, 10, 0.35);
  background-color: rgba(250, 243, 221, 0.85);
  background-image:
    linear-gradient(100deg, rgba(250, 243, 221, 0.96) 34%, rgba(250, 243, 221, 0.62) 56%, rgba(250, 243, 221, 0.15) 100%),
    url("/sunflowers.jpg");
}

/* History drawer: lighter scrim mask in daylight. */
html[data-theme="light"] .vg-drawer__mask {
  background: rgba(60, 47, 16, 0.35);
}

/* ─── Theme toggle icon ───────────────────────────────────────── */
.vg-theme-toggle__icon {
  display: inline-block;
  font-size: 16px;
  line-height: 1;
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.vg-theme-toggle:hover .vg-theme-toggle__icon {
  transform: rotate(40deg);
}
@media (prefers-reduced-motion: reduce) {
  .vg-theme-toggle__icon { transition: none; }
}
```

- [ ] **Step 3: Build to confirm CSS is valid**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): light-mode identity rules + toggle icon styles"
```

---

### Task 7: ThemeToggle component + mount in hero

**Files:**
- Create: `frontend/src/components/ThemeToggle.tsx`
- Modify: `frontend/src/app/page.tsx` (hero Flex, lines ~177–207)

- [ ] **Step 1: Create the toggle button**

Create `frontend/src/components/ThemeToggle.tsx`:

```tsx
'use client';

import { Button } from 'antd';
import { useTheme } from '@/theme/ThemeContext';

// ☾/☀ icon button. Shows the sun while dark (click → light) and the moon
// while light (click → dark). Sits over the hero artwork, so it uses the
// glass tokens like the wallet pill.
export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const isDark = mode === 'dark';
  return (
    <Button
      className="vg-wallet-btn vg-theme-toggle"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      onClick={toggle}
      icon={<span className="vg-theme-toggle__icon">{isDark ? '☀' : '☾'}</span>}
      style={{
        background: 'var(--vg-glass)',
        borderColor: 'var(--vg-glass-border)',
        color: 'var(--vg-on-art)',
        backdropFilter: 'blur(8px)',
      }}
    />
  );
}
```

- [ ] **Step 2: Import and mount it in the hero**

In `frontend/src/app/page.tsx`, add to the imports:

```tsx
import { ThemeToggle } from '@/components/ThemeToggle';
```

Then in the hero top-right `Flex` (the one at `top: 16, right: 16`), add `<ThemeToggle />` as the **first** child, before the `{address && (...History...)}` block:

```tsx
        <Flex gap={8} style={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}>
          <ThemeToggle />
          {address && (
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ThemeToggle.tsx src/app/page.tsx
git commit -m "feat(theme): ☾/☀ toggle button in hero"
```

---

### Task 8: Detox `page.tsx` hardcoded colors

**Files:**
- Modify: `frontend/src/app/page.tsx`

Apply these exact replacements (use the color token map above). Each is a literal-string swap inside `style`/`styles` props:

- [ ] **Step 1: Hero wallet + History buttons** (lines ~184–203)

For the History button `style`: `background: 'rgba(8,14,28,0.55)'` → `background: 'var(--vg-glass)'`; `borderColor: 'rgba(61,90,173,0.6)'` → `borderColor: 'var(--vg-glass-border)'`; `color: '#e8eaf6'` → `color: 'var(--vg-on-art)'`.

For the wallet button `style`: same `background` and `borderColor` swaps; `color: address ? '#9fa8d4' : '#e8eaf6'` → `color: address ? 'var(--vg-on-art-soft)' : 'var(--vg-on-art)'`.

- [ ] **Step 2: Hero title + subtitle** (lines ~215–224)

`color: '#fdfcf7'` → `color: 'var(--vg-on-art)'`.
Subtitle `color: '#cdd3ee'` → `color: 'var(--vg-on-art-soft)'`.
The "No account" span `color: 'rgba(205,211,238,0.6)'` → `color: 'var(--vg-on-art-faint)'`.

- [ ] **Step 3: Free preview block** (lines ~239–244)

Label `color: '#8593cf'` → `color: 'var(--vg-on-art-faint)'`.
Hook `color: '#f0eee8'` → `color: 'var(--vg-on-art)'`.
"Pay to unlock" `color: '#9fb0e0'` → `color: 'var(--vg-on-art-soft)'`.

- [ ] **Step 4: Thread heading + actions** (lines ~272–293)

Heading `color: '#f5d76e'` → `color: 'var(--vg-star)'`.
Regenerate button `color: regenRemaining === 0 ? '#6b74a0' : '#9fa8d4'` → `color: regenRemaining === 0 ? 'var(--vg-faint)' : 'var(--vg-muted)'`.
Copy-all button `color: copiedAll ? '#7bc67e' : '#9fa8d4'` → `color: copiedAll ? 'var(--vg-success)' : 'var(--vg-muted)'`.

- [ ] **Step 5: Gallery statistics** (lines ~344–361)

Each `<span style={{ color: '#9fb0e0', … }}>` label → `color: 'var(--vg-on-art-faint)'` (3 occurrences).
Threads value `color: '#f5d76e'` → `color: 'var(--vg-star)'`.
STX + sBTC values `color: '#f0eee8'` → `color: 'var(--vg-on-art)'` (2 occurrences).

- [ ] **Step 6: Type-check + verify no stray literals remain**

Run: `npx tsc --noEmit`
Then run: `grep -nE "#(e8eaf6|9fa8d4|8593cf|6b74a0|f5d76e|7bc67e|fdfcf7|cdd3ee|9fb0e0|f0eee8)|rgba\(8,14,28,0\.55\)|rgba\(61,90,173,0\.6\)|rgba\(205,211,238" src/app/page.tsx`
Expected: tsc clean; grep returns **no matches**.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx
git commit -m "refactor(theme): tokenize page.tsx colors"
```

---

### Task 9: Detox `TweetCard.tsx`

**Files:**
- Modify: `frontend/src/components/TweetCard.tsx`

- [ ] **Step 1: Replace the counter + body + copy colors**

In the character counter `<Text>` `style` (lines ~30–35):
- `color: over ? '#e57373' : '#8593cf'` → `color: over ? 'var(--vg-error)' : 'var(--vg-faint)'`
- `background: over ? 'rgba(229,115,115,0.1)' : 'rgba(37,61,138,0.25)'` → `background: over ? 'rgba(229,115,115,0.1)' : 'var(--vg-pill-bg)'`
- `border: \`1px solid ${over ? 'rgba(229,115,115,0.3)' : 'rgba(61,90,173,0.25)'}\`` → `border: \`1px solid ${over ? 'rgba(229,115,115,0.3)' : 'var(--vg-pill-border)'}\``

Paragraph `color: '#e8eaf6'` (line ~48) → `color: 'var(--vg-canvas)'`.

Copy button `color: copied ? '#7bc67e' : '#8593cf'` (line ~61) → `color: copied ? 'var(--vg-success)' : 'var(--vg-faint)'`.

- [ ] **Step 2: Type-check + verify**

Run: `npx tsc --noEmit`
Then: `grep -nE "#(e8eaf6|8593cf|7bc67e)|rgba\(37,61,138,0\.25\)|rgba\(61,90,173,0\.25\)" src/components/TweetCard.tsx`
Expected: tsc clean; grep returns **no matches** (the two `rgba(229,115,115,…)` red literals intentionally remain — they read on both themes).

- [ ] **Step 3: Commit**

```bash
git add src/components/TweetCard.tsx
git commit -m "refactor(theme): tokenize TweetCard colors"
```

---

### Task 10: Detox `EmptyGallery.tsx` + `VanGoghLoader.tsx` captions

**Files:**
- Modify: `frontend/src/components/EmptyGallery.tsx`
- Modify: `frontend/src/components/VanGoghLoader.tsx`

> Only the **caption text** colors change. The SVG illustration colors (easel wood `#7a6242`/`#5f4c34`, gilded frame `#b9962f`/`#e3c570`, navy canvas `#101d3f`, swirl `#6b8fc7`, stars `#f5d76e`/`#f7e190`, moon glow) are decorative artwork and stay as-is in both themes.

- [ ] **Step 1: EmptyGallery captions** (lines ~39, ~42)

`<Text className="tp-display" style={{ color: '#c9b85e', … }}>` → `color: 'var(--vg-gold)'`.
`<Text style={{ color: '#8593cf', … }}>` → `color: 'var(--vg-faint)'`.

- [ ] **Step 2: VanGoghLoader caption** (line ~45)

`<Text className="vg-loader__caption tp-display" style={{ color: '#c9b85e', … }}>` → `color: 'var(--vg-gold)'`.

- [ ] **Step 3: Type-check + verify captions only**

Run: `npx tsc --noEmit`
Then: `grep -nE "color: '#(c9b85e|8593cf)'" src/components/EmptyGallery.tsx src/components/VanGoghLoader.tsx`
Expected: tsc clean; grep returns **no matches**.

- [ ] **Step 4: Commit**

```bash
git add src/components/EmptyGallery.tsx src/components/VanGoghLoader.tsx
git commit -m "refactor(theme): tokenize EmptyGallery + VanGoghLoader captions"
```

---

### Task 11: Detox `PaymentStatus.tsx` + `ThreadForm.tsx`

**Files:**
- Modify: `frontend/src/components/PaymentStatus.tsx`
- Modify: `frontend/src/components/ThreadForm.tsx`

- [ ] **Step 1: PaymentStatus txid link** (line ~70)

`style={{ fontSize: 12, color: '#9fa8d4' }}` → `color: 'var(--vg-muted)'`.

- [ ] **Step 2: ThreadForm field label** (line ~20)

In `FieldLabel`, `color: '#8593cf'` → `color: 'var(--vg-faint)'`.

- [ ] **Step 3: Type-check + verify**

Run: `npx tsc --noEmit`
Then: `grep -nE "#(9fa8d4|8593cf)" src/components/PaymentStatus.tsx src/components/ThreadForm.tsx`
Expected: tsc clean; grep returns **no matches**.

- [ ] **Step 4: Commit**

```bash
git add src/components/PaymentStatus.tsx src/components/ThreadForm.tsx
git commit -m "refactor(theme): tokenize PaymentStatus + ThreadForm colors"
```

---

### Task 12: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Unit tests + type-check + production build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all suites pass; tsc clean; webpack build succeeds.

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev` and open `http://localhost:3000`. Verify each:

1. **No-FOUC:** with OS set to Light, hard-reload — page paints cream immediately (no dark flash). Repeat with OS Dark → paints night, no flash.
2. **Toggle:** clicking ☾/☀ flips the whole UI (body, hero painting Starry Night↔Sunflowers, cards, AntD inputs/segmented/buttons, text contrast). Icon swaps and rotates on hover.
3. **Persistence:** toggle to the non-OS mode, reload — choice sticks (reads `localStorage['tg-theme']`).
4. **OS-follow before choice:** clear `localStorage` (`localStorage.removeItem('tg-theme')`), reload, then change OS appearance — the app follows live. After an explicit toggle, it stops following.
5. **Light legibility:** hero title, gallery stats, tweet text, and the free-preview block are clearly readable on cream (no light-on-light).
6. **Reduced motion:** with "Reduce motion" enabled, the toggle icon does not animate and the night-sky animations stay off.

- [ ] **Step 3: Commit (only if Step 1/2 surfaced a fix)**

If any manual issue required a code change, commit it with a focused message, e.g.:

```bash
git add -A
git commit -m "fix(theme): <what was corrected>"
```

If nothing needed fixing, there is no commit for this task.

---

## Self-Review Notes

- **Spec coverage:** Sunflowers light identity (Tasks 5–6), follow-OS + persistence (Tasks 1–3), reactive AntD (Task 4), ☾/☀ toggle in hero (Task 7), no-FOUC (Task 3), CSS tokenization + component detox (Tasks 5, 8–11), unit test of resolver (Task 1), reduced-motion + AA legibility (Tasks 6, 12). All spec sections map to a task.
- **Decorative-SVG decision** (keep artwork colors; only chrome is themed) is stated in the spec's intent and made explicit in Tasks 10's note — reduces churn without hurting the result.
- **Type consistency:** `ThemeMode`, `resolveInitialMode`, `nextMode`, `isThemeMode`, `THEME_STORAGE_KEY`, `useTheme`, `darkTheme`, `lightTheme`, `ThemeProvider` names are used identically across tasks.
- **No placeholders:** every code step shows the actual code or exact literal swap + a grep to confirm completion.
```
