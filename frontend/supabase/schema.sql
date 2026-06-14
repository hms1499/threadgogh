-- Run in Supabase SQL Editor (New project, free tier).
create table invoices (
  invoice_id text primary key,
  topic text not null,
  tone text not null,
  length int not null,
  price_stx bigint not null,
  price_sbtc bigint not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'generating', 'consumed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table generations (
  id bigint generated always as identity primary key,
  invoice_id text not null unique references invoices(invoice_id),
  payer_address text not null,
  token text not null,
  amount bigint not null,
  tx_id text not null,
  thread_content jsonb not null,
  created_at timestamptz not null default now()
);

create index generations_payer_idx on generations(payer_address);

-- All access is server-side via the service-role key (which bypasses RLS).
-- Enable RLS with no policies so the public anon/authenticated roles cannot
-- read these tables directly through PostgREST. See migration 0002.
alter table invoices    enable row level security;
alter table generations enable row level security;
alter table invoices    force row level security;
alter table generations force row level security;
revoke all on invoices    from anon, authenticated;
revoke all on generations from anon, authenticated;
