import { describe, expect, it } from 'vitest';
import { parseThreadJson } from '../generate-thread';

describe('parseThreadJson', () => {
  it('parse JSON array tran', () => {
    expect(parseThreadJson('["tweet 1", "tweet 2"]')).toEqual(['tweet 1', 'tweet 2']);
  });

  it('parse khi bi boc trong code fence', () => {
    const raw = '```json\n["a", "b", "c"]\n```';
    expect(parseThreadJson(raw)).toEqual(['a', 'b', 'c']);
  });

  it('cat tweet vuot 280 ky tu', () => {
    const long = 'x'.repeat(300);
    const out = parseThreadJson(JSON.stringify([long]));
    expect(out[0].length).toBeLessThanOrEqual(280);
  });

  it('throw khi khong phai array of strings', () => {
    expect(() => parseThreadJson('{"a":1}')).toThrow();
    expect(() => parseThreadJson('not json')).toThrow();
  });
});
