-- Opt-in public sharing. A generated thread is private until its owner mints a
-- random share_slug (via /api/share, gated by wallet signature). NULL slug =
-- private; the UNIQUE constraint doubles as the public-lookup index and lets
-- NULLs coexist freely. shared_at records when it was made public.
alter table generations add column if not exists share_slug text;
alter table generations add column if not exists shared_at timestamptz;
create unique index if not exists generations_share_slug_key
  on generations (share_slug);
