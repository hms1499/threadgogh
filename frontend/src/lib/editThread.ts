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
