import { describe, it, expect, vi } from 'vitest';

// history.ts imports the service-role client, which validates server env at import
// time. The pure helpers under test never touch it, so a bare stub is enough.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { normalizeRow, deriveNextCursor, buildKeysetFilter, PAGE_SIZE } from '@/lib/history';

const rawRow = (over: Record<string, unknown> = {}) => ({
  id: 7,
  invoice_id: 'a'.repeat(64),
  token: 'STX',
  amount: 100000,
  tx_id: '0xtx',
  thread_content: ['hook', 'cta'],
  created_at: '2026-06-15T10:00:00.000+00:00',
  invoices: { topic: 'bitcoin layer 2' },
  ...over,
});

describe('normalizeRow', () => {
  it('flattens a to-one invoices object to a top-level topic', () => {
    const item = normalizeRow(rawRow());
    expect(item.topic).toBe('bitcoin layer 2');
    // id and the nested relation must not leak to the client
    expect('id' in item).toBe(false);
    expect('invoices' in item).toBe(false);
    expect(item.invoice_id).toBe('a'.repeat(64));
    expect(item.thread_content).toEqual(['hook', 'cta']);
  });

  it('defensively handles invoices arriving as an array', () => {
    const item = normalizeRow(rawRow({ invoices: [{ topic: 'arrayed' }] }));
    expect(item.topic).toBe('arrayed');
  });

  it('yields null topic when the relation is missing', () => {
    expect(normalizeRow(rawRow({ invoices: null })).topic).toBeNull();
    expect(normalizeRow(rawRow({ invoices: [] })).topic).toBeNull();
  });
});

describe('deriveNextCursor', () => {
  it('returns the last row cursor when a full page came back', () => {
    const rows = Array.from({ length: PAGE_SIZE }, (_, i) =>
      rawRow({ id: i + 1, created_at: `2026-06-15T10:00:${String(i).padStart(2, '0')}.000+00:00` }),
    );
    const cursor = deriveNextCursor(rows);
    expect(cursor).toEqual({ createdAt: rows[PAGE_SIZE - 1].created_at, id: PAGE_SIZE });
  });

  it('returns null when the page is not full (no more rows)', () => {
    expect(deriveNextCursor([rawRow(), rawRow()])).toBeNull();
  });

  it('returns null for an empty page', () => {
    expect(deriveNextCursor([])).toBeNull();
  });
});

describe('buildKeysetFilter', () => {
  it('builds a PostgREST or-filter for (created_at, id) < cursor', () => {
    const f = buildKeysetFilter({ createdAt: '2026-06-15T10:00:00.000+00:00', id: 7 });
    expect(f).toBe(
      'created_at.lt.2026-06-15T10:00:00.000+00:00,' +
        'and(created_at.eq.2026-06-15T10:00:00.000+00:00,id.lt.7)',
    );
  });
});
