import { describe, expect, it } from 'vitest';
import { splashDone } from '../splash';

describe('splashDone', () => {
  it('stays up while not settled and under the cap', () => {
    expect(splashDone(false, 500, 2500)).toBe(false);
  });
  it('dismisses as soon as services settle, even early', () => {
    expect(splashDone(true, 100, 2500)).toBe(true);
  });
  it('dismisses once the cap is reached even if not settled', () => {
    expect(splashDone(false, 2500, 2500)).toBe(true);
    expect(splashDone(false, 3000, 2500)).toBe(true);
  });
});
