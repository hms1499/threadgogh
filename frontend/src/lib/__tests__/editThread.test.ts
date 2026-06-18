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
