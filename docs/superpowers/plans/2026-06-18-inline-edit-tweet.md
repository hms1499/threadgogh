# Inline Edit Tweet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit the text of, and delete, individual tweets in the current generated thread — client-only, no persistence.

**Architecture:** Pure thread-mutation rules (edit-with-revert-on-empty, delete) live in a testable `src/lib/editThread.ts` module. `TweetCard` gains optional `onEdit`/`onDelete` callbacks and a local view/edit toggle; with no callbacks it stays read-only (history drawer unaffected). `page.tsx` owns `thread: string[]` as the single source of truth and wires the callbacks through the pure helpers, only while `phase === 'done'` and not regenerating.

**Tech Stack:** Next.js 16 (App Router), React 19, Ant Design 6, TypeScript 5, Vitest 4. No new dependencies.

## Global Constraints

- **No new dependencies.** No Testing Library / jsdom — the repo tests pure logic only. Tests are `.ts` under `src/**/__tests__/`, glob `src/**/__tests__/**/*.test.ts`, no `globals` (import `describe/it/expect` from `vitest`).
- **Client-only.** No Supabase, no API routes, no auth, no migration, no payment code touched.
- **Webpack only.** Do not touch the `--webpack` flag in `package.json`.
- **Build runs with `npm run build` (webpack), tests with `npm test` (vitest run), lint with `npm run lint` — all from `frontend/`.**
- **280 is warn-only.** Reuse existing `over = length > 280` red counter + `vg-frame--over`; never block save.
- **Spec:** `docs/superpowers/specs/2026-06-18-inline-edit-tweet-design.md`.

---

### Task 1: `applyEdit` pure helper

**Files:**
- Create: `frontend/src/lib/editThread.ts`
- Test: `frontend/src/lib/__tests__/editThread.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `applyEdit(thread: string[], index: number, draft: string): string[]` — returns a new array with `thread[index]` replaced by `draft`; returns the **original array unchanged** when `draft.trim() === ''` (revert) or `index` is out of range.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/__tests__/editThread.test.ts
import { describe, expect, it } from 'vitest';
import { applyEdit } from '../editThread';

describe('applyEdit', () => {
  it('replaces the tweet at index with the draft', () => {
    expect(applyEdit(['a', 'b', 'c'], 1, 'B')).toEqual(['a', 'B', 'c']);
  });

  it('reverts (returns input unchanged) when the draft is empty or whitespace', () => {
    const thread = ['a', 'b', 'c'];
    expect(applyEdit(thread, 1, '')).toEqual(['a', 'b', 'c']);
    expect(applyEdit(thread, 1, '   ')).toEqual(['a', 'b', 'c']);
  });

  it('preserves internal whitespace of a non-empty draft', () => {
    expect(applyEdit(['a'], 0, '  hi  there ')).toEqual(['  hi  there ']);
  });

  it('returns input unchanged for an out-of-range index', () => {
    expect(applyEdit(['a', 'b'], 5, 'x')).toEqual(['a', 'b']);
    expect(applyEdit(['a', 'b'], -1, 'x')).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const thread = ['a', 'b'];
    applyEdit(thread, 0, 'X');
    expect(thread).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/__tests__/editThread.test.ts`
Expected: FAIL — cannot resolve `../editThread` / `applyEdit is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/editThread.ts

// Pure, client-only thread-mutation rules for inline tweet editing.
// The thread (string[]) is owned by the page; these helpers return a new
// array (or the original, unchanged) so callers can drive setState directly.

// Replace the tweet at `index` with `draft`. An empty/whitespace draft is a
// no-op (revert) — removing a tweet is done with `deleteTweet`, not by clearing.
export function applyEdit(thread: string[], index: number, draft: string): string[] {
  if (index < 0 || index >= thread.length) return thread;
  if (draft.trim() === '') return thread;
  const next = thread.slice();
  next[index] = draft;
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/__tests__/editThread.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/editThread.ts frontend/src/lib/__tests__/editThread.test.ts
git commit -m "feat(edit): applyEdit pure helper for inline tweet edit"
```

---

### Task 2: `deleteTweet` pure helper

**Files:**
- Modify: `frontend/src/lib/editThread.ts`
- Test: `frontend/src/lib/__tests__/editThread.test.ts`

**Interfaces:**
- Consumes: existing `editThread.ts` module.
- Produces: `deleteTweet(thread: string[], index: number): string[]` — returns a new array with `thread[index]` removed; returns the **original array unchanged** when `index` is out of range.

- [ ] **Step 1: Write the failing test** (append to the existing test file)

```ts
// append inside frontend/src/lib/__tests__/editThread.test.ts
import { deleteTweet } from '../editThread'; // add to existing import line

describe('deleteTweet', () => {
  it('removes the tweet at index', () => {
    expect(deleteTweet(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
  });

  it('can empty the thread by deleting the last remaining tweet', () => {
    expect(deleteTweet(['only'], 0)).toEqual([]);
  });

  it('returns input unchanged for an out-of-range index', () => {
    expect(deleteTweet(['a', 'b'], 5)).toEqual(['a', 'b']);
    expect(deleteTweet(['a', 'b'], -1)).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const thread = ['a', 'b'];
    deleteTweet(thread, 0);
    expect(thread).toEqual(['a', 'b']);
  });
});
```

> Note: merge the `deleteTweet` import into the existing `import { applyEdit } from '../editThread';` line → `import { applyEdit, deleteTweet } from '../editThread';`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/__tests__/editThread.test.ts`
Expected: FAIL — `deleteTweet is not a function`.

- [ ] **Step 3: Write minimal implementation** (append to `editThread.ts`)

```ts
// append to frontend/src/lib/editThread.ts

// Remove the tweet at `index`. Out-of-range is a no-op. The result may be an
// empty array — the page resets to its idle/empty state in that case.
export function deleteTweet(thread: string[], index: number): string[] {
  if (index < 0 || index >= thread.length) return thread;
  return thread.slice(0, index).concat(thread.slice(index + 1));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/__tests__/editThread.test.ts`
Expected: PASS (all `applyEdit` + `deleteTweet` tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/editThread.ts frontend/src/lib/__tests__/editThread.test.ts
git commit -m "feat(edit): deleteTweet pure helper"
```

---

### Task 3: `TweetCard` inline text-edit UI

**Files:**
- Modify: `frontend/src/components/TweetCard.tsx`

**Interfaces:**
- Consumes: nothing from prior tasks (the page calls `applyEdit` in Task 5; the card only emits the draft).
- Produces: `TweetCard` accepts optional props `onEdit?: (index: number, draft: string) => void` and `onDelete?: (index: number) => void` (the latter wired in Task 4). When `onEdit` is present, an **Edit** affordance enters an inline textarea; committing calls `onEdit(index, draft)`.

**Verification note:** the repo has no component test harness; this task is verified by lint + build + a manual checklist, consistent with the codebase. The commit rule (revert-on-empty) is already unit-tested in `applyEdit`.

- [ ] **Step 1: Add props and edit state**

Update the signature and imports in `frontend/src/components/TweetCard.tsx`:

```tsx
import { useState, type CSSProperties } from 'react';
import { Typography, Button, Flex, App, Input } from 'antd';
import { CopyOutlined, CheckOutlined, EditOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

export function TweetCard({ text, index, total, onEdit, onDelete }: {
  text: string; index: number; total: number;
  onEdit?: (index: number, draft: string) => void;
  onDelete?: (index: number) => void;
}) {
  const { message } = App.useApp();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  // While editing, length signals track the draft so the counter/over-frame
  // stay live as the user types.
  const value = editing ? draft : text;
  const over = value.length > 280;

  function startEdit() {
    setDraft(text);
    setEditing(true);
  }
  function commitEdit() {
    onEdit?.(index, draft); // applyEdit reverts on empty/whitespace
    setEditing(false);
  }
  function cancelEdit() {
    setEditing(false);
  }
```

- [ ] **Step 2: Render the textarea while editing, and an Edit button in view mode**

Replace the `<Paragraph>` block with a conditional, and add an Edit button to the signature row. The counter `Text` already uses `over` — leave it, it now follows `value`.

```tsx
{editing ? (
  <Input.TextArea
    autoFocus
    value={draft}
    onChange={(e) => setDraft(e.target.value)}
    onPressEnter={(e) => {
      // Cmd/Ctrl+Enter commits; plain Enter inserts a newline (tweets are multi-line).
      if (e.metaKey || e.ctrlKey) { e.preventDefault(); commitEdit(); }
    }}
    onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); } }}
    autoSize={{ minRows: 2 }}
    style={{
      margin: '0 0 12px',
      fontSize: 15,
      lineHeight: 1.65,
      color: 'var(--vg-canvas)',
    }}
  />
) : (
  <Paragraph
    style={{
      whiteSpace: 'pre-wrap',
      margin: '0 0 12px',
      fontSize: 15,
      lineHeight: 1.65,
      color: 'var(--vg-canvas)',
    }}
  >
    {text}
  </Paragraph>
)}
```

In the signature `<Flex justify="space-between" align="center">` (the one with Vincent ✦ + Copy), keep the signature on the left and group the action buttons on the right. While editing show **Done**; in view mode show **Edit** (only when `onEdit` is set) next to Copy:

```tsx
<Flex justify="space-between" align="center">
  <Text className="vg-signature">Vincent&nbsp;✦</Text>
  <Flex gap={4} align="center">
    {editing ? (
      <Button
        size="small"
        type="text"
        onClick={commitEdit}
        style={{ color: 'var(--vg-success)', fontSize: 12 }}
      >
        Done
      </Button>
    ) : (
      <>
        {onEdit && (
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={startEdit}
            style={{ color: 'var(--vg-faint)', fontSize: 12 }}
          >
            Edit
          </Button>
        )}
        <Button
          size="small"
          type="text"
          icon={copied ? <CheckOutlined /> : <CopyOutlined />}
          style={{ color: copied ? 'var(--vg-success)' : 'var(--vg-faint)', fontSize: 12 }}
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            message.success('Tweet copied');
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </>
    )}
  </Flex>
</Flex>
```

- [ ] **Step 3: Lint**

Run: `cd frontend && npm run lint`
Expected: PASS, no errors for `TweetCard.tsx`.

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: build succeeds (webpack), no type errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, generate a thread, then on a tweet card:
- Click **Edit** → text becomes a textarea seeded with the tweet; counter updates as you type; typing past 280 turns the counter red and the frame to the over state.
- **Cmd/Ctrl+Enter** or **Done** commits the change; the card returns to view mode showing the new text.
- Clearing all text then **Done** reverts to the original text (no change).
- **Esc** cancels, leaving the original text.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TweetCard.tsx
git commit -m "feat(edit): inline text edit in TweetCard"
```

---

### Task 4: `TweetCard` delete UI

**Files:**
- Modify: `frontend/src/components/TweetCard.tsx`

**Interfaces:**
- Consumes: the `onDelete?: (index: number) => void` prop declared in Task 3.
- Produces: a **Delete** affordance shown in view mode when `onDelete` is set; clicking calls `onDelete(index)`.

- [ ] **Step 1: Add the Delete button**

Import the icon (extend the existing icon import line):

```tsx
import { CopyOutlined, CheckOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
```

In the view-mode action group (the `<>...</>` branch from Task 3, alongside Edit/Copy), add a Delete button when `onDelete` is set. Place it first so destructive action sits at the edge:

```tsx
{onDelete && (
  <Button
    size="small"
    type="text"
    icon={<DeleteOutlined />}
    onClick={() => onDelete(index)}
    style={{ color: 'var(--vg-faint)', fontSize: 12 }}
    aria-label="Delete tweet"
  />
)}
```

- [ ] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual verification** (full wiring is confirmed in Task 5; here confirm the button renders and the icon imports resolve)

Run `npm run dev`; with callbacks not yet wired the Delete button will not appear (no `onDelete` passed) — that is expected until Task 5. Confirm the build/lint pass and no console errors on the page.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TweetCard.tsx
git commit -m "feat(edit): delete affordance in TweetCard"
```

---

### Task 5: Wire edit/delete in `page.tsx`

**Files:**
- Modify: `frontend/src/app/page.tsx` (import near line 8; handlers near the other handlers; render at lines 307-308)

**Interfaces:**
- Consumes: `applyEdit`, `deleteTweet` from `@/lib/editThread`; `TweetCard` `onEdit`/`onDelete` props from Tasks 3-4.
- Produces: nothing for later tasks (final task).

- [ ] **Step 1: Import the helpers**

Add near the other `@/lib` imports (around line 12-13):

```tsx
import { applyEdit, deleteTweet } from '@/lib/editThread';
```

- [ ] **Step 2: Add handlers**

Add inside the `Home` component, near the other handler functions (e.g. just after `refreshStats`):

```tsx
function handleEditTweet(index: number, draft: string) {
  setThread((t) => applyEdit(t, index, draft));
}

function handleDeleteTweet(index: number) {
  const next = deleteTweet(thread, index);
  setThread(next);
  // Deleting the last tweet returns the gallery to its empty/idle state.
  if (next.length === 0) setPhase('idle');
}
```

- [ ] **Step 3: Pass callbacks to `TweetCard` (only when editable)**

Replace the map at lines 307-308:

```tsx
{thread.map((t, i) => {
  const editable = phase === 'done' && !regenerating;
  return (
    <TweetCard
      key={i}
      text={t}
      index={i}
      total={thread.length}
      onEdit={editable ? handleEditTweet : undefined}
      onDelete={editable ? handleDeleteTweet : undefined}
    />
  );
})}
```

- [ ] **Step 4: Lint**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Run the full test suite (no regressions)**

Run: `cd frontend && npm test`
Expected: PASS, including `editThread.test.ts`.

- [ ] **Step 7: Manual verification (end-to-end)**

Run `npm run dev`, generate a thread, then:
- Edit a tweet → **Copy all** output reflects the edited text.
- Delete a middle tweet → remaining "Plate xx / yy" labels and the total renumber correctly.
- Delete every tweet → the view returns to the empty/gallery state (no crash).
- While a regenerate is in flight, Edit/Delete affordances do not appear.
- Open the **history drawer** → tweets there remain read-only (no Edit/Delete), confirming the no-callback path.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat(edit): wire inline edit + delete into thread view"
```

---

## Self-Review Notes

- **Spec coverage:** edit text (Tasks 3, 5 + `applyEdit` Task 1); delete tweet + renumber (Tasks 4, 5 + `deleteTweet` Task 2); warn-only 280 (Task 3 `value`-based `over`); revert-on-empty (Task 1 + Task 3 commit); Copy-all reflects edits (free via `thread.join`, verified Task 5 Step 7); regenerate overrides edits (no special handling needed — `setThread` replaces; affordances hidden while regenerating, Task 5 Step 3); history drawer read-only (no callbacks, Task 5 Step 7); empty-thread fallback (Task 5 Step 2 `setPhase('idle')`); no persistence/auth/migration (Global Constraints).
- **Type consistency:** `onEdit(index, draft)` and `onDelete(index)` signatures identical across Tasks 3, 4, 5; `applyEdit(thread, index, draft)` and `deleteTweet(thread, index)` identical across Tasks 1, 2, 5.
- **No placeholders:** all steps carry concrete code/commands.
