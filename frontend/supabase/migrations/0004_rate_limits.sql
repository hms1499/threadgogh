-- Migration: per-IP fixed-window rate limiting for the unauthenticated quote branch.
--
-- POST /api/generate Branch 1 (no invoiceId) is unauthenticated and, per request,
-- calls the LLM and inserts an invoice row. This table + function cap requests per
-- client key (IP) to a fixed window, atomically: a single statement decides
-- allow/deny with no race between concurrent requests.
-- See docs/superpowers/specs/2026-06-19-quote-rate-limit-design.md.
--
-- Safe to run on an existing project. Run this in the Supabase SQL editor.

create table if not exists rate_limits (
  key          text        primary key,
  count        int         not null,
  window_start timestamptz not null
);

-- One definition of "the stored window has elapsed", shared by both reset branches in
-- check_rate_limit so the count reset and the window reset can never drift apart.
create or replace function rl_window_expired(p_window_start timestamptz, p_window_secs int)
returns boolean
language sql
stable
as $$
  select p_window_start < now() - make_interval(secs => p_window_secs)
$$;

-- Atomic increment-and-check. One row per key. If the stored window has elapsed the
-- window resets (count = 1); otherwise count increments. Both SET expressions read the
-- pre-update row value via the same rl_window_expired() predicate. Returns whether the
-- request is allowed and, when blocked, seconds until reset (window_start + window).
create or replace function check_rate_limit(
  p_key text,
  p_max int,
  p_window_secs int
)
returns table (allowed boolean, retry_after_sec int)
language plpgsql
as $$
declare
  v_count int;
  v_window_start timestamptz;
begin
  insert into rate_limits as r (key, count, window_start)
    values (p_key, 1, now())
  on conflict (key) do update
    set count = case when rl_window_expired(r.window_start, p_window_secs) then 1 else r.count + 1 end,
        window_start = case when rl_window_expired(r.window_start, p_window_secs) then now() else r.window_start end
  returning r.count, r.window_start into v_count, v_window_start;

  allowed := v_count <= p_max;
  retry_after_sec := case
    when allowed then 0
    else greatest(0, ceil(extract(epoch from
      (v_window_start + make_interval(secs => p_window_secs) - now())))::int)
  end;
  return next;
end;
$$;

-- Same lockdown posture as invoices/generations (see 0002_enable_rls): all access is
-- via the service-role client, which bypasses RLS. Deny anon/authenticated both the
-- table and the functions so the limiter can't be read or driven from PostgREST directly.
alter table rate_limits enable row level security;
alter table rate_limits force row level security;
revoke all on rate_limits from anon, authenticated;
revoke execute on function check_rate_limit(text, int, int) from anon, authenticated;
revoke execute on function rl_window_expired(timestamptz, int) from anon, authenticated;

create index if not exists rate_limits_window_idx on rate_limits (window_start);

-- Optional dead-row cleanup for IPs that never return. Correctness does NOT depend on
-- it — the window resets in place on the next hit. To enable with pg_cron:
--   select cron.schedule('rate_limits_gc', '*/30 * * * *',
--     $$delete from rate_limits where window_start < now() - interval '1 hour'$$);
