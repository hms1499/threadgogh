-- Migration: free hook preview (#1)
--
-- Stores the single-tweet hook generated for free at quote time. It is shown to
-- the user before payment and reused as tweet #1 of the paid thread so the LLM is
-- not paid twice for the hook and the preview stays honest.
--
-- Safe to run on an existing table: column is nullable, no backfill needed.
-- Run this in the Supabase SQL editor.

alter table invoices add column if not exists preview_hook text;
