-- Marketplace: tag invoices/generations with a service and store per-service params.
alter table invoices
  add column if not exists service_id text not null default 'x-thread',
  add column if not exists params     jsonb,
  -- Defensive: 0005 adds `language`. Ensure it exists here too so the backfill
  -- below never fails on a DB that hasn't applied 0005 yet (migration-order safe).
  add column if not exists language   text;

-- Backfill existing rows: pack the legacy thread columns into params.
update invoices
  set params = jsonb_build_object(
    'topic', topic, 'tone', tone, 'length', length, 'language', coalesce(language, 'auto'))
  where params is null;

alter table generations
  add column if not exists service_id text not null default 'x-thread';
