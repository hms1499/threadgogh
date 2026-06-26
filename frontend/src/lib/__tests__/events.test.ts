import { describe, it, expect, vi, beforeEach } from 'vitest';

const { insert, from } = vi.hoisted(() => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({ insert }));
  return { insert, from };
});
vi.mock('@/lib/supabase', () => ({ supabase: { from } }));

import { recordEvent } from '@/lib/events';

beforeEach(() => { vi.clearAllMocks(); });

describe('recordEvent', () => {
  it('inserts a valid event/variant pair', async () => {
    await recordEvent('backlink_land', 'thread');
    expect(from).toHaveBeenCalledWith('events');
    expect(insert).toHaveBeenCalledWith({ event: 'backlink_land', variant: 'thread' });
  });

  it('ignores an event outside the allowlist', async () => {
    await recordEvent('evil', 'home');
    expect(from).not.toHaveBeenCalled();
  });

  it('ignores a variant outside the allowlist', async () => {
    await recordEvent('backlink_land', 'sideways');
    expect(from).not.toHaveBeenCalled();
  });
});
