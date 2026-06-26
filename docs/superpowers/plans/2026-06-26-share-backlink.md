# Share Backlink Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Append a removable, default-on ThreadGogh credit as a separate final tweet whenever a user copies or posts a thread to X, turning the shared artifact into a funnel entry.

**Architecture:** Pure URL/text builders live in `lib/postToX.ts` (existing home of pure, unit-tested client helpers). Two UI surfaces — the main generation page (`app/page.tsx`) and the public thread page (`PublicThreadActions` on `/t/[slug]`) — hold a single `includeCredit` boolean (default on) that controls both the Copy text and an extra final step in `PostThreadModal`.

**Tech Stack:** Next.js 16 (App Router, webpack), React 19, Ant Design 6, TypeScript 5, Vitest 4.

## Global Constraints

- **Test command:** `npm test` from `frontend/` (Vitest). Run a single file with `npm test -- src/lib/__tests__/postToX.test.ts`.
- **Build/lint:** `npm run build` and `npm run lint` from `frontend/` — build MUST use webpack (the script already has `--webpack`; never remove it).
- **Credit text (verbatim):** `🧵 Made with ThreadGogh — generate your own X thread, pay-per-thread on Stacks 👇 {url}` — the `{url}` is replaced by the resolved URL; the rest is exact.
- **URL base:** `APP_DOMAIN` from `lib/config.ts` (bare domain, no protocol); always prepend `https://`.
- **Toggle default:** `includeCredit` starts `true` (default on) on both surfaces.
- **Credit is always a separate final tweet** — never concatenated into a paid tweet's own text.
- **Commits:** directly on `main`; commit message MUST NOT include a `Co-Authored-By: Claude` trailer.

---

### Task 1: Pure helpers `creditUrl` + `creditTweet`

**Files:**
- Modify: `frontend/src/lib/postToX.ts`
- Test: `frontend/src/lib/__tests__/postToX.test.ts`

**Interfaces:**
- Consumes: `APP_DOMAIN` from `@/lib/config` (string, bare domain e.g. `threadgogh.vercel.app`).
- Produces:
  - `creditUrl(slug?: string | null): string` — `https://${APP_DOMAIN}/t/${slug}` when `slug` is a non-empty string; `https://${APP_DOMAIN}` otherwise.
  - `creditTweet(url: string): string` — the verbatim credit template with `url` interpolated.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/lib/__tests__/postToX.test.ts`:

```typescript
import { withThreadNumbers, intentUrl, creditUrl, creditTweet } from '../postToX';
import { APP_DOMAIN } from '../config';

describe('creditUrl', () => {
  it('deep-links to the thread when given a slug', () => {
    expect(creditUrl('abc123')).toBe(`https://${APP_DOMAIN}/t/abc123`);
  });

  it('falls back to the homepage with no slug', () => {
    expect(creditUrl()).toBe(`https://${APP_DOMAIN}`);
  });

  it('falls back to the homepage for null/empty slug', () => {
    expect(creditUrl(null)).toBe(`https://${APP_DOMAIN}`);
    expect(creditUrl('')).toBe(`https://${APP_DOMAIN}`);
  });
});

describe('creditTweet', () => {
  it('embeds the url and stays under the 280-char tweet limit', () => {
    const tweet = creditTweet(`https://${APP_DOMAIN}/t/abc123`);
    expect(tweet).toContain(`https://${APP_DOMAIN}/t/abc123`);
    expect(tweet).toContain('Made with ThreadGogh');
    expect(tweet.length).toBeLessThan(280);
  });
});
```

Note: replace the existing top-of-file line `import { withThreadNumbers, intentUrl } from '../postToX';` with the new combined import above (do not leave a duplicate import).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- src/lib/__tests__/postToX.test.ts`
Expected: FAIL — `creditUrl`/`creditTweet` are not exported.

- [ ] **Step 3: Implement the helpers**

Append to `frontend/src/lib/postToX.ts` (add the config import at the top, next to the existing constants):

```typescript
import { APP_DOMAIN } from './config';

// Build the public URL to credit in a posted/copied thread: deep-link to the
// shared thread when we have its slug, otherwise the homepage. APP_DOMAIN is a
// bare domain (no protocol), so prepend https://. SSR-safe (no window access).
export function creditUrl(slug?: string | null): string {
  const base = `https://${APP_DOMAIN}`;
  return slug ? `${base}/t/${slug}` : base;
}

// The standalone final "credit" tweet appended to a thread on copy/post. Kept a
// separate tweet (never merged into paid content) and well under 280 chars.
export function creditTweet(url: string): string {
  return `🧵 Made with ThreadGogh — generate your own X thread, pay-per-thread on Stacks 👇 ${url}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- src/lib/__tests__/postToX.test.ts`
Expected: PASS (all existing + new cases).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/threadpay
git add frontend/src/lib/postToX.ts frontend/src/lib/__tests__/postToX.test.ts
git commit -m "feat(share): creditUrl + creditTweet helpers for backlink"
```

---

### Task 2: `PostThreadModal` optional credit step

**Files:**
- Modify: `frontend/src/components/PostThreadModal.tsx`

**Interfaces:**
- Consumes: `withThreadNumbers` (existing), `intentUrl` (existing).
- Produces: `PostThreadModal` gains an optional prop `credit?: string | null`. When a non-empty string, it is appended as one extra, unnumbered final walkthrough step labeled "ThreadGogh link — optional"; the real thread's `i/n` numbering is unchanged. When null/absent, behavior is identical to today.

- [ ] **Step 1: Replace the component body to thread the credit step through**

Replace the entire contents of `frontend/src/components/PostThreadModal.tsx` with:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Modal, Button, Typography, Flex } from 'antd';
import { TwitterOutlined, ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { withThreadNumbers, intentUrl } from '@/lib/postToX';

const { Paragraph, Text } = Typography;

// Guided "post the whole thread to X" flow. The X compose-intent can't pre-link a
// reply, so we walk the user one tweet at a time (numbered i/n) and tell them to
// reply each new tweet to the previous one to build the chain. When `credit` is
// set, it's appended as one extra, unnumbered final step (a standalone reply) so
// the real thread's i/n count stays honest.
export function PostThreadModal({ thread, chained = true, credit = null, open, onClose }: {
  thread: string[]; chained?: boolean; credit?: string | null; open: boolean; onClose: () => void;
}) {
  const numbered = withThreadNumbers(thread, chained);
  const n = numbered.length;
  const steps = credit ? [...numbered, credit] : numbered;
  const creditStep = credit ? steps.length - 1 : -1;
  const [step, setStep] = useState(0);
  const [openedCurrent, setOpenedCurrent] = useState(false);

  // Restart the walkthrough whenever the modal (re)opens.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(0);
    setOpenedCurrent(false);
  }, [open]);

  const current = steps[step] ?? '';
  const onCredit = step === creditStep;
  const over = current.length > 280;
  const isLast = step === steps.length - 1;

  function openCurrent() {
    window.open(intentUrl(current), '_blank', 'noopener,noreferrer');
    setOpenedCurrent(true);
  }
  function go(delta: number) {
    setStep((s) => Math.min(steps.length - 1, Math.max(0, s + delta)));
    setOpenedCurrent(false);
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title="Post thread to X"
      destroyOnHidden
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
        X opens each tweet in a new tab — post it, then{' '}
        <Text strong style={{ fontSize: 13 }}>reply to it</Text> with the next to build the thread.
      </Text>

      <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
        <Text className="vg-plate">{onCredit ? 'ThreadGogh link — optional' : `Tweet ${step + 1} / ${n}`}</Text>
        <Text
          className="tp-mono"
          style={{ fontSize: 11, color: over ? 'var(--vg-error)' : 'var(--vg-faint)' }}
        >
          {current.length}/280
        </Text>
      </Flex>

      <Paragraph
        style={{
          whiteSpace: 'pre-wrap',
          padding: '12px 14px',
          borderRadius: 10,
          background: 'var(--vg-pill-bg)',
          border: `1px solid ${over ? 'var(--vg-error-border)' : 'var(--vg-pill-border)'}`,
          fontSize: 14,
          lineHeight: 1.6,
          margin: '0 0 16px',
        }}
      >
        {current}
      </Paragraph>

      <Button
        type="primary"
        block
        icon={<TwitterOutlined />}
        onClick={openCurrent}
        style={{ marginBottom: 12 }}
      >
        {openedCurrent
          ? 'Opened — reopen on X'
          : onCredit ? 'Open ThreadGogh link on X' : `Open tweet ${step + 1} on X`}
      </Button>

      <Flex justify="space-between" align="center">
        <Button
          type="text"
          size="small"
          icon={<ArrowLeftOutlined />}
          disabled={step === 0}
          onClick={() => go(-1)}
        >
          Back
        </Button>
        {isLast ? (
          <Button type="text" size="small" onClick={onClose}>
            Done
          </Button>
        ) : (
          <Button
            type="text"
            size="small"
            onClick={() => go(1)}
          >
            Next <ArrowRightOutlined />
          </Button>
        )}
      </Flex>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd frontend && npm run lint`
Expected: no errors for `PostThreadModal.tsx`.

- [ ] **Step 3: Confirm existing tests still pass**

Run: `cd frontend && npm test`
Expected: PASS (no test references the modal directly; this guards against import/type breakage).

- [ ] **Step 4: Commit**

```bash
cd /Users/vanhuy/Desktop/threadpay
git add frontend/src/components/PostThreadModal.tsx
git commit -m "feat(share): optional credit step in PostThreadModal"
```

---

### Task 3: Toggle + credit on the public `/t/[slug]` page

**Files:**
- Modify: `frontend/src/components/PublicThreadActions.tsx`
- Modify: `frontend/src/app/t/[slug]/page.tsx:44`

**Interfaces:**
- Consumes: `creditUrl`, `creditTweet` (Task 1); `PostThreadModal` `credit` prop (Task 2).
- Produces: `PublicThreadActions` gains a required prop `slug: string`. Holds `includeCredit` (default `true`); Copy appends the credit when on; passes `credit` to the modal.

- [ ] **Step 1: Replace `PublicThreadActions.tsx`**

Replace the entire contents of `frontend/src/components/PublicThreadActions.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { Button, Flex, App, Checkbox } from 'antd';
import { CopyOutlined, TwitterOutlined } from '@ant-design/icons';
import { PostThreadModal } from '@/components/PostThreadModal';
import { creditUrl, creditTweet } from '@/lib/postToX';

// Client island for the public page: copy the whole thread, or walk the
// post-to-X flow. Reuses PostThreadModal. `chained` controls i/n numbering.
// `includeCredit` (default on) appends a removable ThreadGogh backlink as a
// separate final tweet, deep-linking back to this thread.
export function PublicThreadActions({ thread, chained, slug }: { thread: string[]; chained: boolean; slug: string }) {
  const { message } = App.useApp();
  const [postOpen, setPostOpen] = useState(false);
  const [includeCredit, setIncludeCredit] = useState(true);
  const credit = includeCredit ? creditTweet(creditUrl(slug)) : null;
  return (
    <Flex gap={8} align="center" wrap justify="flex-end">
      <Checkbox checked={includeCredit} onChange={(e) => setIncludeCredit(e.target.checked)}>
        Add ThreadGogh link
      </Checkbox>
      <Button
        icon={<CopyOutlined />}
        onClick={() => {
          navigator.clipboard.writeText(credit ? `${thread.join('\n\n')}\n\n${credit}` : thread.join('\n\n'));
          message.success('Whole thread copied');
        }}
      >
        Copy
      </Button>
      <Button type="primary" icon={<TwitterOutlined />} onClick={() => setPostOpen(true)}>
        Post to X
      </Button>
      <PostThreadModal thread={thread} chained={chained} credit={credit} open={postOpen} onClose={() => setPostOpen(false)} />
    </Flex>
  );
}
```

- [ ] **Step 2: Pass `slug` from the page**

In `frontend/src/app/t/[slug]/page.tsx`, change line 44 from:

```tsx
        <PublicThreadActions thread={tweets} chained={chained} />
```

to:

```tsx
        <PublicThreadActions thread={tweets} chained={chained} slug={slug} />
```

(`slug` is already in scope — destructured from `params` at the top of `PublicThreadPage`.)

- [ ] **Step 3: Typecheck + lint**

Run: `cd frontend && npm run lint`
Expected: no errors. Confirms the new `slug` prop is supplied and types line up.

- [ ] **Step 4: Build to catch any SSR/type issues**

Run: `cd frontend && npm run build`
Expected: build succeeds (webpack). `creditUrl` is SSR-safe (no `window`), so `/t/[slug]` renders.

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/threadpay
git add frontend/src/components/PublicThreadActions.tsx frontend/src/app/t/[slug]/page.tsx
git commit -m "feat(share): backlink toggle on public thread page"
```

---

### Task 4: Toggle + credit on the main generation page

**Files:**
- Modify: `frontend/src/app/page.tsx` (imports; new state; button row `~402-447`; Copy-all `~429-434`; modal `468`)

**Interfaces:**
- Consumes: `creditUrl`, `creditTweet` (Task 1); `PostThreadModal` `credit` prop (Task 2); existing `shareUrl` state (`page.tsx:191`, a full deep-link URL set after sharing, else empty/falsy).
- Produces: no exported interface change — internal UI only.

- [ ] **Step 1: Add the imports**

In `frontend/src/app/page.tsx`, add `Checkbox` to the existing `antd` import and import the helpers. Add near the other `@/lib` imports:

```tsx
import { creditUrl, creditTweet } from '@/lib/postToX';
```

And ensure `Checkbox` is included in the `antd` import list (add it if missing).

- [ ] **Step 2: Add the toggle state and derived credit**

Add next to the other `useState` hooks (near `const [postOpen, setPostOpen] = useState(false);` at line 48):

```tsx
  const [includeCredit, setIncludeCredit] = useState(true);
```

Then, where `thread`/`shareUrl` are in scope in the render body (just before the `return`, alongside other derived values), add:

```tsx
  const credit = includeCredit ? creditTweet(shareUrl || creditUrl()) : null;
```

(`shareUrl` holds a full deep link once shared; `creditUrl()` is the homepage fallback.)

- [ ] **Step 3: Add the toggle to the button row**

In the action `Flex` (lines ~402–447), add the checkbox as the first child (before the "Post to X" button):

```tsx
              <Checkbox
                checked={includeCredit}
                onChange={(e) => setIncludeCredit(e.target.checked)}
                style={{ color: 'var(--vg-muted)' }}
              >
                Add ThreadGogh link
              </Checkbox>
```

- [ ] **Step 4: Append credit in "Copy all"**

Change the Copy-all `onClick` body (line ~430) from:

```tsx
                  navigator.clipboard.writeText(thread.join('\n\n'));
```

to:

```tsx
                  navigator.clipboard.writeText(credit ? `${thread.join('\n\n')}\n\n${credit}` : thread.join('\n\n'));
```

- [ ] **Step 5: Pass credit to the modal**

Change line 468 from:

```tsx
      <PostThreadModal thread={thread} chained={threadChained} open={postOpen} onClose={() => setPostOpen(false)} />
```

to:

```tsx
      <PostThreadModal thread={thread} chained={threadChained} credit={credit} open={postOpen} onClose={() => setPostOpen(false)} />
```

- [ ] **Step 6: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: both succeed (webpack build).

- [ ] **Step 7: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/vanhuy/Desktop/threadpay
git add frontend/src/app/page.tsx
git commit -m "feat(share): backlink toggle on main generation page"
```

---

## Self-Review

**Spec coverage:**
- creditUrl/creditTweet helpers → Task 1. ✅
- PostThreadModal separate final credit step, honest i/n → Task 2. ✅
- Public `/t/[slug]` toggle + deep-link + Copy/Post wiring → Task 3. ✅
- Main page toggle + homepage-or-deep-link + Copy/Post wiring → Task 4. ✅
- Unit tests for pure helpers → Task 1. ✅
- Edge cases (280 limit, unchained, toggle off, SSR) → covered by Task 1 test + Task 2 logic (credit unnumbered, `onCredit` guard) + `creditUrl` SSR-safety verified in Task 3 build. ✅
- Out-of-scope items (persisted preference, custom text, UTM, forced share) → not introduced. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `creditUrl(slug?: string | null)` and `creditTweet(url: string)` used identically in Tasks 3 & 4; `PostThreadModal` `credit?: string | null` prop defined in Task 2 and supplied in Tasks 3 & 4; `PublicThreadActions` `slug: string` prop defined in Task 3 and supplied from `page.tsx`. ✅
