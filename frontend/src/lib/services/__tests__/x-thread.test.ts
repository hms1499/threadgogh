import { describe, expect, it } from 'vitest';
import { xThreadService as s } from '../x-thread';

describe('x-thread validate', () => {
  it('accepts a well-formed request', () => {
    const r = s.validate({ topic: 'AI agents', tone: 'educational', length: 8, language: 'en' });
    expect(r).toEqual({ ok: true, params: { topic: 'AI agents', tone: 'educational', length: 8, language: 'en' } });
  });
  it('defaults unknown language to auto', () => {
    const r = s.validate({ topic: 'x', tone: 'funny', length: 5, language: 'klingon' });
    expect(r.ok && r.params.language).toBe('auto');
  });
  it('rejects an empty topic', () => {
    expect(s.validate({ topic: '  ', tone: 'funny', length: 5 })).toMatchObject({ ok: false });
  });
  it('rejects a topic over 300 chars', () => {
    expect(s.validate({ topic: 'x'.repeat(301), tone: 'funny', length: 5 })).toMatchObject({ ok: false });
  });
  it('rejects a bad tone', () => {
    expect(s.validate({ topic: 'x', tone: 'nope', length: 5 })).toMatchObject({ ok: false });
  });
  it('rejects a bad length', () => {
    expect(s.validate({ topic: 'x', tone: 'funny', length: 7 })).toMatchObject({ ok: false });
  });
});

describe('x-thread metadata', () => {
  it('is chained and has the four fields', () => {
    expect(s.id).toBe('x-thread');
    expect(s.chained).toBe(true);
    expect(s.fields.map((f) => f.name)).toEqual(['topic', 'tone', 'length', 'language']);
  });
});
