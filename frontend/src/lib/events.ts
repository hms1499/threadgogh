import { supabase } from './supabase';
import { log } from './log';

// Server-only. Allowlist for the landing instrumentation — see the backlink
// instrumentation spec. Anything outside these is dropped so a hostile or malformed
// beacon can never pollute the table or crash the route.
const ALLOWED_EVENTS = ['backlink_land'];
const ALLOWED_VARIANTS = ['home', 'thread'];

// Append one landing row. No-op on invalid input; never throws (an insert failure is
// logged, not propagated — a tracking write must not break the request path).
export async function recordEvent(event: string, variant: string): Promise<void> {
  if (!ALLOWED_EVENTS.includes(event) || !ALLOWED_VARIANTS.includes(variant)) return;
  const { error } = await supabase.from('events').insert({ event, variant });
  if (error) log.warn('track.record_failed', { event, variant, err: error.message });
}
