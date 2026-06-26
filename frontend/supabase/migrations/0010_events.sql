-- Append-only landing-event log for the backlink loop (Q1 instrumentation). One row per
-- real-client beacon hit; read with SQL. No PII — only event + variant + timestamp.
create table if not exists events (
  id         bigint generated always as identity primary key,
  event      text        not null,
  variant    text        not null,
  created_at timestamptz not null default now()
);

create index if not exists events_event_created_idx on events (event, created_at);

-- Same lockdown posture as invoices/rate_limits (0002/0004): all access is via the
-- service-role client, which bypasses RLS. Deny anon/authenticated the table entirely.
alter table events enable row level security;
alter table events force row level security;
revoke all on events from anon, authenticated;
