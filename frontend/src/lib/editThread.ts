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

// Remove the tweet at `index`. Out-of-range is a no-op. The result may be an
// empty array — the page resets to its idle/empty state in that case.
export function deleteTweet(thread: string[], index: number): string[] {
  if (index < 0 || index >= thread.length) return thread;
  return thread.slice(0, index).concat(thread.slice(index + 1));
}
