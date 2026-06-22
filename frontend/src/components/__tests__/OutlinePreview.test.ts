import { describe, it, expect } from 'vitest';
import { lockedOutlineRows } from '../OutlinePreview';

describe('lockedOutlineRows', () => {
  it('returns the rows after the hook (outline[1..])', () => {
    expect(lockedOutlineRows(['hook pt', 'second', 'third'])).toEqual(['second', 'third']);
  });

  it('returns [] for a null outline', () => {
    expect(lockedOutlineRows(null)).toEqual([]);
  });

  it('returns [] for a hook-only outline', () => {
    expect(lockedOutlineRows(['just the hook'])).toEqual([]);
  });
});
