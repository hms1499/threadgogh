import { supabase } from './supabase';
import { log } from './log';

// Server-only. A fixed-window rate limiter backed by a Supabase RPC, used to cap the
// unauthenticated quote branch of /api/generate (which costs an LLM call + a DB row).
// See docs/superpowers/specs/2026-06-19-quote-rate-limit-design.md.

type IpHeaders = { headers: { get(name: string): string | null } };

// Derive the client IP from proxy headers. A request with no usable IP collapses to a
// single shared "unknown" bucket — it must stay limited, never bypass the limiter.
export function clientIp(req: IpHeaders): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  return 'unknown';
}

export type RateLimitResult = { allowed: boolean; retryAfterSec: number };

// Atomic increment-and-check via the check_rate_limit Postgres function. Fails OPEN on
// any error: the caller's next step also needs Supabase, so a real outage fails there
// anyway — a limiter blip must not block legitimate users.
export async function checkRateLimit(
  key: string,
  opts: { max: number; windowSec: number },
): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key, p_max: opts.max, p_window_secs: opts.windowSec,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: Boolean(row?.allowed),
      retryAfterSec: Number(row?.retry_after_sec ?? 0),
    };
  } catch (e) {
    log.warn('rate_limit.check_failed', { key, err: e });
    return { allowed: true, retryAfterSec: 0 };
  }
}
