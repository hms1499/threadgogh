import { describe, expect, it } from 'vitest';
import { applyEdit, deleteTweet } from '../editThread';

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
