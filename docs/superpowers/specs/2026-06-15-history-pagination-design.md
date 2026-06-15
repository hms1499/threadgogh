# History pagination + topic normalize — design

Date: 2026-06-15
Scope: recommendation #1 (keyset pagination + index) and #4 (defensive topic
normalization) for the thread history feature. Recommendations #2 (session token)
and #3 (SIWE hardening) are explicitly out of scope.

## Problem

`POST /api/history` returns a hard `limit(20)` ordered by `created_at desc` with no
way to page further — after 20 threads a wallet permanently loses access to older
ones. The query is also unsupported by an index (`generations_payer_idx` covers the
`payer_address` filter but not the `created_at` ordering).

## #4 finding (verified, not a bug)

`generations.invoice_id` is `not null unique references invoices(invoice_id)` — a
to-one relationship, so PostgREST/supabase-js returns the embedded `invoices` as an
object `{topic}`, matching the current `HistoryPanel` typing. No runtime bug. We add a
small defensive normalization (handle object-or-array → flat `topic`) so the client
contract stays stable if the schema ever changes.

## Design

### Data (migration 0003)

```sql
create index generations_payer_created_idx
  on generations (payer_address, created_at desc, id desc);
drop index generations_payer_idx; -- superseded; composite covers the payer prefix
```

Mirror the change in `supabase/schema.sql`.

### API: `POST /api/history`

- Request body gains optional `cursor: { createdAt: string; id: number } | null`.
- Select gains `id` (needed as the keyset tiebreaker and to build the next cursor).
- Keyset: with a cursor, add `(created_at, id) < (cursor.createdAt, cursor.id)` via
  PostgREST `.or('created_at.lt.<ts>,and(created_at.eq.<ts>,id.lt.<id>)')`. Always
  `order by created_at desc, id desc`, `limit 20`.
- Response: `{ items, nextCursor }`. `nextCursor` is `{createdAt, id}` of the last item
  when a full page (20) is returned, else `null` (no more rows).
- `topic` is flattened server-side so each item is `{ ..., topic: string | null }`
  instead of nested `invoices`.
- Auth is unchanged: every request still verifies the signature against the 5-minute
  window, so replay protection is identical to today. Signature reuse is a client-side
  concern only.

### Client: `HistoryPanel.tsx`

- New state: `cred: { message; signature } | null` (cached after first sign-in),
  `cursor`, and a derived "has more" from `nextCursor`.
- `loadHistory()` (first page): sign → store `cred` → fetch page 1.
- `loadMore()`: reuse `cred` + send `cursor` → append items. No new wallet popup.
- On a 401 (e.g. `signature expired`): clear `cred`, fall back to the "Sign in" button
  so the user re-signs on the next action.
- Render a "Load more" button while `nextCursor !== null`.

## Tasks / commits

1. `feat(db): add keyset index for history pagination` — migration 0003 + schema.sql.
2. `feat(api): keyset pagination for history route` — cursor, nextCursor, flat topic.
3. `feat(ui): load-more in HistoryPanel reusing signature` — client state + load more.
4. `test:` — cursor + expiry paths (TDD; route currently has no test).

TDD per change: write the failing test first, then implement.
