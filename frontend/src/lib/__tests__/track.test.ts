import { describe, expect, it } from 'vitest';
import { backlinkVariant } from '../track';

describe('backlinkVariant', () => {
  it('classifies a deep-link thread path as thread', () => {
    expect(backlinkVariant('/t/abc123')).toBe('thread');
  });

  it('classifies the homepage as home', () => {
    expect(backlinkVariant('/')).toBe('home');
  });

  it('classifies a bare /t (no slug) as home', () => {
    expect(backlinkVariant('/t')).toBe('home');
  });

  it('classifies other app paths as home', () => {
    expect(backlinkVariant('/history')).toBe('home');
  });
});
