// Pure, client-only helpers for handing a generated thread off to X (Twitter)
// via the web Intent compose URL. The X intent endpoint opens a pre-filled
// compose box but cannot auto-chain replies, so the page drives a guided,
// one-tweet-at-a-time flow; these functions only build the text and the URLs.

const INTENT_BASE = 'https://x.com/intent/tweet';
const TWEET_LIMIT = 280;

// Append an "i/n" thread marker to each tweet. A single-tweet thread is never
// numbered, and an unchained service (standalone posts, e.g. hot-takes) is never
// numbered either. If the marker would push a tweet past 280 chars it's left off
// that tweet (we don't truncate the user's words) — returns a new array, input intact.
export function withThreadNumbers(thread: string[], chained: boolean = true): string[] {
  const n = thread.length;
  if (!chained || n <= 1) return thread.slice();
  return thread.map((text, i) => {
    const marker = `\n\n${i + 1}/${n}`;
    return text.length + marker.length <= TWEET_LIMIT ? text + marker : text;
  });
}

// Build an X compose-intent URL for a single tweet's text. Empty/whitespace text
// yields the bare compose URL (no `text` param) rather than an empty draft.
export function intentUrl(text: string): string {
  if (text.trim() === '') return INTENT_BASE;
  return `${INTENT_BASE}?text=${encodeURIComponent(text)}`;
}
