# History drawer — design

Date: 2026-06-15
Scope: surface thread history through a Drawer opened from the hero, instead of an
inline panel buried at the bottom of the page. UI/IA only — no change to the history
API, session auth, or pagination already on main.

## Problem

`HistoryPanel` renders inline near the bottom of a long single-column page
(`page.tsx:236`), below the generated thread and above stats. There is no persistent
nav, so history is hard to discover. The user wants a "history on the nav" entry point.

## Decision

Move history into a right-side Drawer launched from a **History** button in the hero
(next to the wallet button). Remove the inline panel — the Drawer is the only entry
(single source, no duplicated state).

## Design

### `page.tsx`

- New state `historyOpen: boolean`.
- Hero: a `History` button (icon `HistoryOutlined`), rendered only when `address` is
  set, opens the Drawer. Placed alongside the existing wallet button.
- `<Drawer placement="right" title="Your threads" open={historyOpen} onClose=...>`
  wrapping `<HistoryPanel address={address} onSelect=... />`. Width ~380. Inherits the
  dark theme (`colorBgElevated`), so no custom colors needed.
- `onSelect` becomes `setThread(t); setPhase('done'); setHistoryOpen(false)`. The
  existing effect at `page.tsx:47` (deps `[phase, thread]`) already scrolls the thread
  into view when `thread` changes, so no extra scroll code is needed — closing the
  Drawer is enough.
- Remove the inline `<HistoryPanel>` block (`page.tsx:235-238`).

### `HistoryPanel.tsx`

- Drop the internal "Your threads" label line — it now duplicates the Drawer title.
  Everything else (sign-in, cookie-based paging, Load more, 401 handling) is unchanged.

## Testing / verification

No page-level UI unit tests exist in the repo. Verify with `tsc --noEmit` + `eslint`,
and a manual `npm run dev` pass: connect wallet → History button appears → open Drawer
→ sign in → Load more → select an item → Drawer closes and the thread scrolls into view.

## Commit

Single cohesive change: `feat(ui): open history in a drawer from the hero`.
