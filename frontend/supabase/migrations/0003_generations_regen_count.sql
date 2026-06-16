-- Migration: free re-roll (#2)
--
-- Counts how many times a paid generation has been re-rolled, so the server can
-- cap free regenerations at MAX_FREE_REGENS. Incremented via a compare-and-swap
-- UPDATE (WHERE regen_count = <expected>) so concurrent clicks can't over-count.
--
-- Safe to run on an existing table: NOT NULL with a default backfills existing rows.
-- Run this in the Supabase SQL editor.

alter table generations add column if not exists regen_count int not null default 0;
