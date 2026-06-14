-- Migration: lock down direct PostgREST access (mainnet review blocker)
--
-- All app access goes through Next.js API routes using the SERVICE ROLE key,
-- which bypasses Row Level Security. Without RLS, the default `anon` /
-- `authenticated` roles can read every invoice and generation straight from
-- PostgREST using only the project URL — leaking topics, full thread content,
-- payer addresses and tx ids.
--
-- Enabling RLS with NO policies denies all row access to anon/authenticated
-- while the server (service role) keeps working unchanged. Revokes are
-- belt-and-suspenders on top of RLS.
--
-- Safe to run on an existing project. Run this in the Supabase SQL editor.

alter table invoices    enable row level security;
alter table generations enable row level security;

-- Force RLS even for table owners that aren't the service role.
alter table invoices    force row level security;
alter table generations force row level security;

revoke all on invoices    from anon, authenticated;
revoke all on generations from anon, authenticated;
