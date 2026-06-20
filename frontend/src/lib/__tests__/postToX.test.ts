import { describe, expect, it } from 'vitest';
import { withThreadNumbers, intentUrl } from '../postToX';

describe('withThreadNumbers', () => {
  it('appends an i/n marker to every tweet in a multi-tweet thread', () => {
    expect(withThreadNumbers(['a', 'b', 'c'])).toEqual([
      'a\n\n1/3',
      'b\n\n2/3',
      'c\n\n3/3',
    ]);
  });

  it('does not number a single-tweet thread', () => {
    expect(withThreadNumbers(['only'])).toEqual(['only']);
  });

  it('returns an empty array for an empty thread', () => {
    expect(withThreadNumbers([])).toEqual([]);
  });

  it('leaves a tweet unnumbered when the marker would exceed 280 chars', () => {
    const long = 'x'.repeat(277); // 277 + "\n\n1/2" (5) = 282 > 280
    const [first, second] = withThreadNumbers([long, 'short']);
    expect(first).toBe(long); // unnumbered, untruncated
    expect(second).toBe('short\n\n2/2');
  });

  it('numbers a tweet that fits exactly at the 280 boundary', () => {
    const fit = 'x'.repeat(275); // 275 + "\n\n1/2" (5) = 280
    expect(withThreadNumbers([fit, 'b'])[0]).toBe(`${fit}\n\n1/2`);
  });

  it('does not mutate the input array', () => {
    const thread = ['a', 'b'];
    withThreadNumbers(thread);
    expect(thread).toEqual(['a', 'b']);
  });
});

describe('intentUrl', () => {
  it('builds an X compose-intent URL with the text URL-encoded', () => {
    expect(intentUrl('hello world & friends')).toBe(
      'https://x.com/intent/tweet?text=hello%20world%20%26%20friends',
    );
  });

  it('encodes newlines and the i/n marker', () => {
    expect(intentUrl('line one\n\n1/3')).toBe(
      'https://x.com/intent/tweet?text=line%20one%0A%0A1%2F3',
    );
  });

  it('returns the bare compose URL for empty or whitespace text', () => {
    expect(intentUrl('')).toBe('https://x.com/intent/tweet');
    expect(intentUrl('   ')).toBe('https://x.com/intent/tweet');
  });
});
