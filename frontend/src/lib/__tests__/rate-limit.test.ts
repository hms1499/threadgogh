import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

import { clientIp, checkRateLimit } from '@/lib/rate-limit';
import { supabase } from '@/lib/supabase';

const rpc = vi.mocked(supabase.rpc);

function headers(map: Record<string, string>) {
  return { headers: { get: (n: string) => map[n.toLowerCase()] ?? null } };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('clientIp', () => {
  it('uses the first hop of x-forwarded-for', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' }))).toBe('1.2.3.4');
  });

  it('trims whitespace around the first hop', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '  5.6.7.8  ' }))).toBe('5.6.7.8');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    expect(clientIp(headers({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('falls back to "unknown" when no IP header is present', () => {
    expect(clientIp(headers({}))).toBe('unknown');
  });
});

describe('checkRateLimit', () => {
  it('allows when the RPC row says allowed', async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_sec: 0 }], error: null } as never);
    const res = await checkRateLimit('quote:1.2.3.4', { max: 10, windowSec: 60 });
    expect(res).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(rpc).toHaveBeenCalledWith('check_rate_limit', {
      p_key: 'quote:1.2.3.4', p_max: 10, p_window_secs: 60,
    });
  });

  it('blocks with retry-after when the RPC row says not allowed', async () => {
    rpc.mockResolvedValue({ data: [{ allowed: false, retry_after_sec: 42 }], error: null } as never);
    const res = await checkRateLimit('quote:1.2.3.4', { max: 10, windowSec: 60 });
    expect(res).toEqual({ allowed: false, retryAfterSec: 42 });
  });

  it('fails open when the RPC returns an error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'db down' } } as never);
    const res = await checkRateLimit('quote:1.2.3.4', { max: 10, windowSec: 60 });
    expect(res.allowed).toBe(true);
  });

  it('fails open when the RPC throws', async () => {
    rpc.mockRejectedValue(new Error('network'));
    const res = await checkRateLimit('quote:1.2.3.4', { max: 10, windowSec: 60 });
    expect(res.allowed).toBe(true);
  });
});
