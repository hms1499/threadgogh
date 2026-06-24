import { describe, it, expect, vi } from 'vitest';

// share.ts imports the service-role client at module load; the pure helper under
// test never touches it, so a bare stub is enough (mirrors history.test.ts).
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { normalizePublicRow } from '@/lib/share';

const rawRow = (over: Record<string, unknown> = {}) => ({
  invoice_id: 'a'.repeat(64),
  service_id: 'hot-takes',
  token: 'STX',
  amount: 100000,
  tx_id: '0xtx',
  thread_content: ['hook', 'cta'],
  invoices: { topic: 'bitcoin layer 2' },
  ...over,
});

describe('normalizePublicRow', () => {
  it('flattens the to-one invoices relation to a top-level topic', () => {
    const t = normalizePublicRow(rawRow());
    expect(t.topic).toBe('bitcoin layer 2');
    expect('invoices' in t).toBe(false);
    expect(t.invoice_id).toBe('a'.repeat(64));
    expect(t.thread_content).toEqual(['hook', 'cta']);
  });

  it('handles invoices arriving as an array', () => {
    expect(normalizePublicRow(rawRow({ invoices: [{ topic: 'arrayed' }] })).topic).toBe('arrayed');
  });

  it('yields null topic when the relation is missing', () => {
    expect(normalizePublicRow(rawRow({ invoices: null })).topic).toBeNull();
  });

  it('defaults a null service_id to x-thread (pre-marketplace rows)', () => {
    expect(normalizePublicRow(rawRow({ service_id: null })).service_id).toBe('x-thread');
  });
});
