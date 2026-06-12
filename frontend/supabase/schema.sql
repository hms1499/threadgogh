-- Run in Supabase SQL Editor (New project, free tier).
create table invoices (
  invoice_id text primary key,
  topic text not null,
  tone text not null,
  length int not null,
  price_stx bigint not null,
  price_sbtc bigint not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'consumed')),
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
