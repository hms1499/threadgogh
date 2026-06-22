-- Fix: new invoices are written by createInvoice with only (service_id, params);
-- the legacy thread columns (topic/tone/length) are no longer populated. They still
-- carry NOT NULL from the pre-marketplace schema, so every quote insert failed with
--   null value in column "topic" of relation "invoices" violates not-null constraint
-- (surfaced to the client as the opaque "Could not get a quote"). Drop NOT NULL so
-- the columns stay readable for old rows (history.ts reads invoices(topic)) but are
-- optional for new ones, which keep their values in params.
alter table invoices
  alter column topic  drop not null,
  alter column tone   drop not null,
  alter column length drop not null;
