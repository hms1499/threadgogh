-- Outline preview: a short title per tweet, shown (locked) before payment and
-- used as the skeleton for the paid generation. Nullable — services without an
-- outline (hot-takes) and degraded quotes leave it null.
alter table invoices add column if not exists preview_outline jsonb;
