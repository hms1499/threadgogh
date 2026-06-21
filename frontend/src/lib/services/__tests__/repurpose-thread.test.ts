import { describe, expect, it } from 'vitest';
import { repurposeThreadService as s, buildRepurposeSystem } from '../repurpose-thread';

describe('repurpose-thread validate', () => {
  const ok = { sourceText: 'A long article about climate policy.', tone: 'educational', length: 8, language: 'en' };
  it('accepts well-formed input', () => {
    expect(s.validate(ok)).toEqual({ ok: true, params: { ...ok } });
  });
  it('rejects empty sourceText', () => {
    expect(s.validate({ ...ok, sourceText: '   ' })).toMatchObject({ ok: false });
  });
  it('rejects sourceText over 4000 chars', () => {
    expect(s.validate({ ...ok, sourceText: 'x'.repeat(4001) })).toMatchObject({ ok: false });
  });
  it('rejects a bad length', () => {
    expect(s.validate({ ...ok, length: 7 })).toMatchObject({ ok: false });
  });
});

describe('repurpose-thread metadata + prompt', () => {
  it('is chained with a sourceText field', () => {
    expect(s.chained).toBe(true);
    expect(s.fields[0].name).toBe('sourceText');
  });
  it('prompt encodes the language instruction', () => {
    expect(buildRepurposeSystem(8, 'vi')).toContain('Vietnamese');
  });
});
