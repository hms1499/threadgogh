# Structured server logging

**Date:** 2026-06-19
**Status:** approved

## Problem

Server code logs via ad-hoc `console.warn`/`console.error` with free-form
`[scope] message` strings (5 sites across `generate`, `regenerate`, `rate-limit`).
There are no consistent fields to correlate a request across log lines, and error
objects are stringified inconsistently. For a payment app this makes incident triage
harder than it needs to be.

## Approach

A tiny dependency-free structured logger emitting one JSON line per call. Chosen over
adding an external error-tracking service (Sentry) — no provisioning, no new env, and
it is the foundation a service can consume later. Matches the project's "no new managed
service unless needed" stance.

## Design

### `lib/log.ts`
- API: `log.info(event, fields?)`, `log.warn(event, fields?)`, `log.error(event, fields?)`.
  - `event`: short `scope.event` key (e.g. `generate.unhandled_error`).
  - `fields`: `Record<string, unknown>` of context (`invoiceId`, `txId`, `payer`, `key`, `err`).
- Output: one JSON line per call, routed to the console method matching the level
  (`error → console.error`, `warn → console.warn`, `info → console.log`) so it still
  flows to stdout/stderr and Vercel log drains. Shape: `{ ts, level, event, ...fields }`,
  `ts` an ISO-8601 string.
- Error normalization: when `fields.err` is an `Error`, serialize to
  `{ name, message, stack }`; otherwise `String(err)`. Accepts `unknown` safely since
  every call site uses `catch (e)`.
- Never logs request content (topic/thread). `invoiceId`/`payer` are correlation keys;
  server-side logging of them is acceptable (payer is a public on-chain address).

### Call-site replacements
| Site | Replacement |
|------|-------------|
| `generate.ts` preview hook failed | `log.warn('generate.preview_hook_failed', { err: e })` |
| `generate.ts` reclaim stale lock | `log.warn('generate.stale_lock_reclaimed', { invoiceId })` |
| `generate.ts` unhandled | `log.error('generate.unhandled_error', { err: e })` |
| `regenerate.ts` unhandled | `log.error('regenerate.unhandled_error', { invoiceId, err: e })` |
| `rate-limit.ts` check failed | `log.warn('rate_limit.check_failed', { key, err: e })` |

## Testing (TDD)

`lib/__tests__/log.test.ts`:
- each level emits a single JSON line to the matching console method (spy).
- the line parses to `{ ts, level, event, ...fields }` with a parseable ISO `ts`.
- an `Error` in `err` serializes to `{ name, message, stack }`.
- a non-Error `err` serializes to a string.
- arbitrary fields are merged through.

Route tests are unchanged — they assert behavior, not log output.

## Out of scope (YAGNI)

- External error-tracking service (Sentry/Axiom) — can consume these logs later.
- Pretty-printing in dev, log-level filtering, request-id middleware.
