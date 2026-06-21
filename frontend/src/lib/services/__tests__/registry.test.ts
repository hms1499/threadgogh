import { describe, expect, it } from 'vitest';
import { SERVICES, getService, publicRegistry } from '../registry';

describe('registry', () => {
  it('has the three launch services', () => {
    expect(Object.keys(SERVICES).sort()).toEqual(['hot-takes', 'repurpose-thread', 'x-thread']);
  });
  it('getService returns a def by id', () => {
    expect(getService('x-thread').id).toBe('x-thread');
  });
  it('getService throws on an unknown id', () => {
    expect(() => getService('nope')).toThrow(/unknown service/);
  });
  it('publicRegistry exposes only public fields (no functions)', () => {
    for (const d of publicRegistry()) {
      expect(Object.keys(d).sort()).toEqual(['blurb', 'chained', 'fields', 'id', 'label', 'priceSbtc', 'priceStx']);
      expect(typeof (d as Record<string, unknown>).validate).toBe('undefined');
      expect(typeof (d as Record<string, unknown>).generate).toBe('undefined');
    }
  });
  it('every def has required public fields', () => {
    for (const d of publicRegistry()) {
      expect(d.id && d.label && d.blurb).toBeTruthy();
      expect(Array.isArray(d.fields) && d.fields.length).toBeTruthy();
      expect(typeof d.chained).toBe('boolean');
    }
  });
});
