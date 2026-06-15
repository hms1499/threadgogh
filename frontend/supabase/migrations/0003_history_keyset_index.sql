-- Migration: support keyset pagination for thread history.
--
-- The history query filters by payer_address and orders by created_at desc
-- (with id as a stable tiebreaker for the keyset cursor). The old
-- `generations_payer_idx` only covered the payer_address filter, leaving the
-- sort unindexed. This composite index covers both, and its leading
-- payer_address column supersedes the old single-column index.
--
-- Safe to run on an existing project. Run this in the Supabase SQL editor.

create index if not exists generations_payer_created_idx
  on generations (payer_address, created_at desc, id desc);

drop index if exists generations_payer_idx;
