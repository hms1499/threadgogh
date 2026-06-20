-- Migration: per-thread output language
--
-- Stores the language the thread should be written in, chosen at quote time
-- (e.g. 'vi' for Vietnamese, 'auto' to match the topic). Persisting it on the
-- invoice lets a free re-roll regenerate in the same language as the paid thread.
--
-- Safe to run on an existing table: column is nullable, no backfill needed
-- (a null/absent value is treated as 'auto'). Run this in the Supabase SQL editor.

alter table invoices add column if not exists language text;
