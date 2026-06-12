-- Migration: stale generation-lock recovery (senior review item #1)
--
-- Adds a timestamp stamped when an invoice enters the 'generating' state. If the
-- worker that claimed the lock crashes before saving the result, the lock would
-- otherwise strand a PAID user forever (every retry sees status='generating' and
-- gets 202 indefinitely). With this column, claimInvoice() can atomically reclaim
-- a 'generating' row whose lock is older than GENERATING_STALE_MS.
--
-- Safe to run on an existing table: column is nullable, no backfill needed.
-- Run this in the Supabase SQL editor.

alter table invoices add column if not exists generating_at timestamptz;
