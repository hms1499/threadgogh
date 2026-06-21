import { describe, expect, it } from 'vitest';
import { defaultParams, clientValidate } from '../form';
import type { ServiceField } from '../types';

const fields: ServiceField[] = [
  { name: 'topic', type: 'text', label: 'Topic', maxLen: 300, required: true },
  { name: 'tone', type: 'select', label: 'Tone', default: 'educational', options: [{ value: 'educational', label: 'e' }] },
  { name: 'length', type: 'number', label: 'Length', default: 8, options: [5, 8, 12] },
];

describe('defaultParams', () => {
  it('seeds text empty and select/number to their default', () => {
    expect(defaultParams(fields)).toEqual({ topic: '', tone: 'educational', length: 8 });
  });
});

describe('clientValidate', () => {
  it('flags a missing required field', () => {
    expect(clientValidate(fields, { topic: '', tone: 'educational', length: 8 })).toMatch(/Topic/);
  });
  it('flags over-maxLen text', () => {
    expect(clientValidate(fields, { topic: 'x'.repeat(301), tone: 'educational', length: 8 })).toMatch(/Topic/);
  });
  it('returns null when valid', () => {
    expect(clientValidate(fields, { topic: 'ok', tone: 'educational', length: 8 })).toBeNull();
  });
});
