# Van Gogh Loading Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an immersive Van Gogh "canvas being painted" loading experience in two moments — a full-screen splash on app open, and a full-screen interaction-blocking takeover while the LLM generates a thread — sharing one visual component.

**Architecture:** One shared `VanGoghCanvas` full-screen overlay (pure SVG/CSS). `AppSplash` wraps it for the open moment (shows until services settle, capped at 2.5s, then fades). `page.tsx` renders `AppSplash` until ready and renders `VanGoghCanvas` while `phase === 'generating'`. This is an additive display layer — it does not touch payment/generate/regenerate/registry logic.

**Tech Stack:** Next.js 16 (App Router, webpack), React 19, TypeScript 5, Ant Design 6, Vitest 4. No new dependencies.

## Global Constraints

- All commands run from `frontend/` (e.g. `cd frontend && npm test`).
- Webpack only — never add/remove the `--webpack` flag on `dev`/`build`.
- No new dependencies. Pure SVG/CSS; new keyframes/classes namespaced `vg-` in `globals.css`. AntD only for layout/typography.
- Tests are `.test.ts` only under `src/**/__tests__/` (Vitest include `src/**/__tests__/**/*.test.ts`). No `.tsx`/component tests — UI tasks are verified by `npm run build` and noted as manual smoke.
- Honour `prefers-reduced-motion: reduce` (show the finished painting statically, no sweep/loop) — matches the existing animation code.
- Commit directly on `main` (solo project). Commit messages must NOT include a `Co-Authored-By: Claude` trailer.
- Reuse existing CSS variables (`--vg-gold`, `--vg-muted`, `--vg-star`) and keyframes (`vg-spin`, `vg-twinkle`, `vg-pulse`) — they already exist in `globals.css`.
- Do not modify the existing inline `VanGoghLoader` component (it stays in use for the `quoting` phase).

---

### Task 1: `splashDone` readiness helper

A pure predicate deciding when the open splash should dismiss: as soon as services have settled, OR once the cap elapses. Extracted so the timing rule is unit-testable; the React wiring (effects/timers) lives in `AppSplash` (Task 3).

**Files:**
- Create: `src/lib/splash.ts`
- Test: `src/lib/__tests__/splash.test.ts`

**Interfaces:**
- Produces: `export function splashDone(servicesSettled: boolean, elapsedMs: number, capMs: number): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/splash.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { splashDone } from '../splash';

describe('splashDone', () => {
  it('stays up while not settled and under the cap', () => {
    expect(splashDone(false, 500, 2500)).toBe(false);
  });
  it('dismisses as soon as services settle, even early', () => {
    expect(splashDone(true, 100, 2500)).toBe(true);
  });
  it('dismisses once the cap is reached even if not settled', () => {
    expect(splashDone(false, 2500, 2500)).toBe(true);
    expect(splashDone(false, 3000, 2500)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/__tests__/splash.test.ts`
Expected: FAIL — module `../splash` not found.

- [ ] **Step 3: Implement**

Create `src/lib/splash.ts`:

```ts
// True once the open splash should dismiss: services have settled (loaded or
// errored — either way the page can show), or the cap has elapsed so a slow
// network never traps the user behind the splash.
export function splashDone(servicesSettled: boolean, elapsedMs: number, capMs: number): boolean {
  return servicesSettled || elapsedMs >= capMs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/__tests__/splash.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/lib/splash.ts src/lib/__tests__/splash.test.ts
git commit -m "feat(splash): splashDone readiness predicate"
```

---

### Task 2: `VanGoghCanvas` overlay component + CSS

The shared full-screen "canvas being painted" overlay. Pure SVG/CSS, locks body scroll while mounted, honours reduced-motion, optional explorer tx link.

**Files:**
- Create: `src/components/VanGoghCanvas.tsx`
- Modify: `src/app/globals.css` (append the new keyframes/classes)

**Interfaces:**
- Consumes: `STACKS_NETWORK` from `@/lib/config`.
- Produces: `export function VanGoghCanvas({ label, tx, fadingOut }: { label: string; tx?: string; fadingOut?: boolean })`.

- [ ] **Step 1: Add the CSS**

Append to the end of `src/app/globals.css`:

```css
/* ─── Full-screen Van Gogh loading canvas (splash + generation) ── */
@keyframes vg-canvas-paint { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes vg-overlay-in   { from { opacity: 0; } to { opacity: 1; } }
@keyframes vg-overlay-out  { from { opacity: 1; } to { opacity: 0; } }

.vg-canvas-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: radial-gradient(circle at 50% 38%, #1b2a52 0%, #0b1228 70%, #060a18 100%);
  animation: vg-overlay-in 0.45s ease both;
}
.vg-canvas-overlay.is-out { animation: vg-overlay-out 0.4s ease forwards; }
.vg-canvas-art   { animation: vg-canvas-paint 2.2s cubic-bezier(0.22, 1, 0.36, 1) both; }
.vg-canvas-swirl { transform-origin: 88px 85px; animation: vg-spin 16s linear infinite; }
.vg-canvas-star  { animation: vg-twinkle 2.4s ease-in-out infinite; }
.vg-canvas-moon  { animation: vg-pulse 3.2s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  .vg-canvas-overlay,
  .vg-canvas-overlay.is-out { animation: none; }
  .vg-canvas-art   { animation: none; clip-path: none; }
  .vg-canvas-swirl,
  .vg-canvas-star,
  .vg-canvas-moon  { animation: none; }
}
```

- [ ] **Step 2: Create the component**

Create `src/components/VanGoghCanvas.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { Typography } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { STACKS_NETWORK } from '@/lib/config';

const { Text } = Typography;

// Full-screen Van Gogh "canvas being painted" overlay. Pure SVG/CSS; honours
// reduced-motion (shows the finished scene statically). Used for the app-open
// splash and the generation takeover. Locks body scroll while mounted.
export function VanGoghCanvas({ label, tx, fadingOut }: {
  label: string; tx?: string; fadingOut?: boolean;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className={`vg-canvas-overlay${fadingOut ? ' is-out' : ''}`} role="status" aria-label={label}>
      <svg className="vg-canvas-art" width="220" height="200" viewBox="0 0 220 200" aria-hidden="true">
        {/* rolling hills */}
        <path d="M0 168 C60 150 150 150 220 170 L220 200 L0 200 Z" fill="#13351f" />
        {/* moon + halo */}
        <circle cx="168" cy="48" r="30" fill="#f7e190" opacity="0.15" />
        <circle className="vg-canvas-moon" cx="168" cy="48" r="20" fill="#f7e190" opacity="0.9" />
        {/* swirling brush strokes */}
        <g className="vg-canvas-swirl">
          <path d="M70 70 C100 55 120 80 105 100 C95 113 78 108 80 94"
            stroke="#6b8fc7" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8" />
          <path d="M70 70 C95 62 108 80 99 95"
            stroke="#c9b85e" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
        </g>
        {/* stars */}
        <circle className="vg-canvas-star" cx="36" cy="40" r="3" fill="#f5d76e" />
        <circle className="vg-canvas-star" cx="200" cy="120" r="2.5" fill="#f7e190" />
        <circle className="vg-canvas-star" cx="28" cy="110" r="2.5" fill="#f5d76e" />
      </svg>

      <Text
        className="vg-loader__caption tp-display"
        style={{ color: 'var(--vg-gold)', fontStyle: 'italic', fontSize: 17 }}
      >
        {label}
      </Text>

      {tx && (
        <Typography.Link
          className="tp-mono"
          href={`https://explorer.hiro.so/txid/${tx}?chain=${STACKS_NETWORK}`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, color: 'var(--vg-muted)' }}
        >
          {tx.slice(0, 10)}…{tx.slice(-8)} <ExportOutlined />
        </Typography.Link>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify it builds**

Run: `cd frontend && npm run build`
Expected: PASS (no type errors). The component isn't rendered anywhere yet — this only proves it compiles.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/components/VanGoghCanvas.tsx src/app/globals.css
git commit -m "feat(ui): VanGoghCanvas full-screen painting overlay + keyframes"
```

---

### Task 3: `AppSplash` wrapper

Wraps `VanGoghCanvas` for the app-open moment: shows until `splashDone` is true (services settled or cap reached), then plays the fade-out and unmounts.

**Files:**
- Create: `src/components/AppSplash.tsx`

**Interfaces:**
- Consumes: `splashDone` from `@/lib/splash`; `VanGoghCanvas` from `./VanGoghCanvas`.
- Produces: `export function AppSplash({ servicesSettled, capMs }: { servicesSettled: boolean; capMs?: number })` — `capMs` defaults to `2500`.

- [ ] **Step 1: Create the component**

Create `src/components/AppSplash.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { splashDone } from '@/lib/splash';
import { VanGoghCanvas } from './VanGoghCanvas';

// App-open splash. Shows the painting until services settle (loaded or errored)
// or the cap elapses, then fades out (~400ms) and unmounts. Shown on every load.
export function AppSplash({ servicesSettled, capMs = 2500 }: {
  servicesSettled: boolean; capMs?: number;
}) {
  const startRef = useRef(Date.now());
  const [done, setDone] = useState(false);   // readiness reached → begin fade
  const [hidden, setHidden] = useState(false); // fade finished → unmount

  // Dismiss when ready, and arm a cap timer so a slow network can't trap the user.
  useEffect(() => {
    if (done) return;
    if (splashDone(servicesSettled, Date.now() - startRef.current, capMs)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDone(true);
      return;
    }
    const remaining = Math.max(0, capMs - (Date.now() - startRef.current));
    const t = setTimeout(() => setDone(true), remaining);
    return () => clearTimeout(t);
  }, [servicesSettled, capMs, done]);

  // Play the fade-out, then unmount.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setHidden(true), 400);
    return () => clearTimeout(t);
  }, [done]);

  if (hidden) return null;
  return <VanGoghCanvas label="Warming up the studio…" fadingOut={done} />;
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd frontend && npm run build`
Expected: PASS. Not rendered yet — proves it compiles.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/AppSplash.tsx
git commit -m "feat(ui): AppSplash open-splash wrapper (ready + cap + fade)"
```

---

### Task 4: Wire into `page.tsx` + retire the inline loader for `generating`

Render `AppSplash` until services settle, render `VanGoghCanvas` while generating, and stop the inline `VanGoghLoader` from also showing during `generating` (the takeover covers it).

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/PaymentStatus.tsx`

**Interfaces:**
- Consumes: `AppSplash` from `@/components/AppSplash`; `VanGoghCanvas` from `@/components/VanGoghCanvas`.

- [ ] **Step 1: Import the components in `page.tsx`**

In `src/app/page.tsx`, add after the existing `PostThreadModal` import line (`import { PostThreadModal } from '@/components/PostThreadModal';`):

```tsx
import { AppSplash } from '@/components/AppSplash';
import { VanGoghCanvas } from '@/components/VanGoghCanvas';
```

- [ ] **Step 2: Add the `servicesSettled` state**

In `src/app/page.tsx`, find:

```tsx
  const [services, setServices] = useState<PublicServiceDef[]>([]);
  const [servicesError, setServicesError] = useState(false);
```

Add directly below them:

```tsx
  const [servicesSettled, setServicesSettled] = useState(false);
```

- [ ] **Step 3: Mark services as settled after the fetch**

In `src/app/page.tsx`, find the services fetch:

```tsx
    fetch('/api/services')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then((d) => { if (Array.isArray(d?.services)) setServices(d.services); else throw new Error('bad payload'); })
      .catch(() => setServicesError(true));
```

Replace it with (adds `.finally`):

```tsx
    fetch('/api/services')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then((d) => { if (Array.isArray(d?.services)) setServices(d.services); else throw new Error('bad payload'); })
      .catch(() => setServicesError(true))
      .finally(() => setServicesSettled(true));
```

- [ ] **Step 4: Render the overlays**

In `src/app/page.tsx`, find the opening of the main element:

```tsx
    <main className="tp-shell" style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px 80px' }}>

      {/* ── Hero: the real Starry Night painting ── */}
```

Insert the overlays as the first children, right after the `<main ...>` line:

```tsx
    <main className="tp-shell" style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px 80px' }}>

      {/* ── Van Gogh loading overlays ── */}
      <AppSplash servicesSettled={servicesSettled} />
      {phase === 'generating' && <VanGoghCanvas label="Painting your thread…" tx={txid} />}

      {/* ── Hero: the real Starry Night painting ── */}
```

- [ ] **Step 5: Stop the inline loader during `generating`**

In `src/components/PaymentStatus.tsx`, find:

```tsx
        {(phase === 'quoting' || phase === 'generating') && (
          <VanGoghLoader label={LOADER_LABEL[phase]} />
        )}
```

Replace with (keep the inline loader for `quoting` only — `generating` now uses the full-screen takeover):

```tsx
        {phase === 'quoting' && (
          <VanGoghLoader label={LOADER_LABEL[phase]} />
        )}
```

- [ ] **Step 6: Verify build + full test suite**

Run: `cd frontend && npm run build && npm test`
Expected: build PASS; `npm test` PASS (all existing tests + the 3 new `splashDone` tests).

- [ ] **Step 7: Manual smoke (operator)**

Run `cd frontend && npm run dev`, then in the browser:
- Reload the app → the painting splash appears and fades out once services load (and within ~2.5s even on a throttled "Slow 3G" network in devtools).
- Generate a thread → full-screen takeover appears during `generating`, blocks interaction (page can't scroll), shows the tx link, and dissolves into the paint-revealed thread on completion.
- Force a generation error (e.g. stop the LLM / use a bad key) → the overlay dismisses to reveal the error/recover UI (not stuck behind the overlay).
- Toggle OS "Reduce motion" → splash and takeover show the finished painting statically with no sweeping/looping motion.

- [ ] **Step 8: Commit**

```bash
cd frontend && git add src/app/page.tsx src/components/PaymentStatus.tsx
git commit -m "feat(ui): Van Gogh splash on load + full-screen generation takeover"
```

---

## Final verification

- [ ] Run `cd frontend && npm test` — all tests green (existing + 3 new `splashDone` tests).
- [ ] Run `cd frontend && npm run build` — clean production build (webpack).
- [ ] Run `cd frontend && npm run lint` — no new lint errors.
- [ ] Operator manual smoke (Task 4 Step 7): splash on load, generation takeover, error-path dismissal, reduced-motion.

## Self-review notes (coverage vs spec)

- Spec §2 approach (pure SVG/CSS, one shared component, no `loading.tsx`, no WebGL) → Tasks 2–4.
- Spec §3 components (`VanGoghCanvas`, `AppSplash`, page integration, `VanGoghLoader` retained for `quoting`) → Tasks 2, 3, 4.
- Spec §4 behavior: splash readiness + 2.5s cap + every-load + fade → Tasks 1, 3, 4 (Steps 2–4); generation takeover bound to `generating`, body-scroll lock, tx link, dissolve-out, phase-bound safety → Tasks 2 (scroll lock), 4 (render guard).
- Spec §4 reduced-motion → Task 2 CSS `@media` block.
- Spec §5 constraints (no deps, `vg-` namespace, additive) → honoured across tasks; reuse of `vg-spin`/`vg-twinkle`/`vg-pulse` per Global Constraints.
- Spec §6 testing (`splashDone` unit + build/manual) → Task 1 (unit), Tasks 2–4 (build + manual smoke).
