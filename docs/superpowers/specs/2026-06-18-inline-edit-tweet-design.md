# Inline Edit Tweet — Design

**Date:** 2026-06-18
**Status:** Approved (design), pending implementation plan
**Scope:** Client-only inline editing of generated thread tweets

## 1. Problem

ThreadGogh generates an X thread and stops. The user can only copy the result
verbatim — there is no way to fix a typo, tighten a sentence, or drop a weak
tweet without paying to regenerate the whole thread. This closes part of the
product loop: get the user from "generated" to "ready to post".

## 2. Goals & Non-Goals

**Goals**
- Edit the text of any tweet in the current result, in place.
- Delete a tweet from the current result.
- Keep the Van Gogh "gallery frame" aesthetic intact while editing.
- Copy / Copy-all reflect the edited thread automatically.

**Non-Goals (explicitly out of scope)**
- Persistence. Edits live in client state only; reload discards them.
- Auth / DB migration / API routes / payment changes — none.
- Adding tweets, reordering tweets (separate future feature).
- Editing threads shown in the history drawer (those stay read-only).
- Enforcing the 280-character limit (warn only, never block).

## 3. Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Persist edits? | **No** — client-only, ephemeral. |
| Interaction model | **Click-to-edit inline, per tweet.** Other tweets stay in view mode. |
| Structural actions | **Edit text + delete tweet.** No add/reorder. |
| Over-280 handling | **Warn only, allow save.** Reuse existing red counter + `vg-frame--over`. |
| Empty after edit | **Revert** to previous text (do not commit). Deleting uses the Delete action. |

## 4. Architecture

The current thread mutable state already lives in `page.tsx` as `thread:
string[]`. That stays the single source of truth. `TweetCard` becomes a
self-managed view/edit component but does **not** own the committed text — it
only owns transient edit UI state.

### `page.tsx`
Owns `thread` and passes two optional callbacks to each `TweetCard`:
- `onEdit(index, newText)` → replace element `index` in `thread`.
- `onDelete(index)` → remove element `index` from `thread`.

Because `total` is derived from `thread.length`, deleting a tweet
automatically renumbers the "Plate xx / yy" labels and the counter.

Edit/Delete affordances are only wired when `phase === 'done'` and not while
`regenerating` is true.

### `TweetCard`
New optional props: `onEdit?`, `onDelete?`.
- When **both/any callback present** → render Edit / Delete affordances.
- When **absent** → identical read-only behavior as today (safe for the
  history drawer and any other reuse — they simply pass no callbacks).

Local state (exists only during editing):
- `editing: boolean`
- `draft: string`

## 5. Data Flow / Interaction

1. **Enter edit:** set `draft = text`, `editing = true`. Render a `<textarea>`
   (seeded with `draft`) in place of the read-only `<Paragraph>`.
2. **While typing:** the 280 counter and `vg-frame--over` state track `draft`
   live, reusing the existing `over = text.length > 280` logic against `draft`.
3. **Commit (Done / blur):**
   - If `draft.trim() === ''` → **revert**: discard `draft`, exit edit, do NOT
     call `onEdit`. (To remove a tweet, use Delete.)
   - Else → call `onEdit(index, draft)`, exit edit. Saving is allowed even when
     `draft.length > 280` (counter stays red).
4. **Cancel (Esc):** discard `draft`, exit edit, text unchanged.
5. **Delete:** call `onDelete(index)`. Deleted directly (no confirm) — this is
   client-only and "undo" is a regenerate. (Revisit if it feels too sharp.)

### Interactions with existing features
- **Copy / Copy-all** read from `thread`, so they pick up edits with no change.
- **Regenerate** replaces the entire `thread`, discarding edits — expected.
- Editing never touches invoices, receipts, Supabase, or payment.

## 6. Edge Cases

- **Delete the last tweet** → `thread.length === 0`. UI must fall back to the
  empty / gallery state cleanly (as before any generation). Verify no crash on
  empty `thread`.
- **Over 280 on save** → allowed; red counter + over frame persist.
- **Reduced motion** → textarea needs no animation; existing reveal stagger is
  unaffected.

## 7. Testing

`TweetCard` (Vitest + Testing Library):
- Enter edit → change text → Done calls `onEdit(index, newValue)`.
- Edit to empty → Done does **not** call `onEdit` (revert).
- Esc cancels, leaves text unchanged.
- Delete calls `onDelete(index)`.
- Counter reflects `draft` while typing, including red state past 280.
- No callbacks passed → no Edit/Delete affordances (read-only parity).

`page.tsx` level:
- Editing one tweet then Copy-all includes the new text (testable at the
  state/handler level).
- Deleting a tweet renumbers remaining plates and shrinks `total`.

## 8. Out-of-scope follow-ups (noted, not built here)

- Reorder / add tweets (full editor).
- Persisting edits to `generations.thread_content` (would need wallet-sig auth,
  a migration, and an API route — a separate spec).
