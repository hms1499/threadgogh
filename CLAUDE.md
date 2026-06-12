# ThreadPay

High-level index for this repo. Deep detail lives in `.claude/docs/` — follow the
links in **Additional Documentation** before touching a domain you don't know.

## 1. Project Overview

ThreadPay generates X (Twitter) threads with an LLM and charges per generation via
an x402-style flow on Stacks: the API returns HTTP 402 with an invoice, the user pays
STX or sBTC on-chain to a Clarity contract that records a receipt, and the server
verifies that receipt before generating. No accounts, no subscriptions — payment is
the only gate.

## 2. Tech Stack

- **Next.js 16.2.9** (App Router) + **React 19.2.4** — frontend + API routes (`frontend/`)
- **TypeScript 5**, **Ant Design 6.4.4**, **Tailwind 4**, React Compiler
- **@stacks/connect 8.2.6**, **@stacks/transactions 7.4.0** — wallet + on-chain calls
- **@supabase/supabase-js 2.108.1** — Postgres (invoices, generations)
- **Clarinet / Clarity v4** — smart contracts (`contracts/`)
- **Vitest 4.1.8** — unit + route tests
- LLM: provider-agnostic (Groq default). NOT the Anthropic/Claude API. See docs.

## 3. Dev Commands

Frontend (run from `frontend/`):

```bash
npm install
npm run dev      # next dev --webpack   (MUST be webpack — see Key Constraints)
npm run build    # next build --webpack
npm test         # vitest run
npm run lint
```

Requires `frontend/.env.local` (see `frontend/.env.example`). Migrations to apply in
Supabase live in `frontend/supabase/migrations/`.

Contracts (run from `contracts/`):

```bash
clarinet check                                   # type-check Clarity
npm test                                          # simnet unit tests (vitest)
clarinet deployments apply --testnet --no-dashboard -d   # deploy (needs Testnet.toml)
```

## 4. Core Logic Summary

Pay-per-generate, payment-gated by an on-chain receipt:

1. `POST /api/generate` with `{topic,tone,length}` → creates an invoice (random
   32-byte id), returns **HTTP 402** + price + contract id.
2. Client signs `pay-stx`/`pay-sbtc` on `thread-pay`; the contract stores a receipt
   keyed by invoice id. Price is a **minimum** (`amount >= min-price`).
3. `POST /api/generate` with `{invoiceId, txId}` → server reads the receipt on-chain,
   checks `amount >= quoted price`, then generates and persists the thread.

An atomic DB lock (`pending → generating → consumed`) makes generation idempotent and
double-spend-safe. Full lifecycle in `.claude/docs/data-model.md`.

## 5. Key Constraints

Things to never change or assume without explicit reason:

- **Webpack only.** `dev`/`build` use `--webpack`. Turbopack breaks `@stacks/transactions`
  (WASM/bundling). Do not remove the flag.
- **This Next.js is modified.** Before writing frontend code, read the relevant guide
  in `frontend/node_modules/next/dist/docs/` (per `frontend/AGENTS.md`). APIs may
  differ from your training data.
- **Wallet calls MUST carry post-conditions.** The wallet runs deny-mode; any token a
  contract-call moves must be declared or it rolls back. See `.claude/docs/payments.md`.
- **LLM is pluggable, not Claude.** Switch via `LLM_PROVIDER`; default Groq (free).
  Don't hardwire a provider or add `@anthropic-ai/sdk`.
- **The on-chain receipt is the source of truth for payment** — never mark an invoice
  paid/consumed from client input alone.
- **`SUPABASE_SERVICE_ROLE_KEY` is server-only.** Never import `lib/supabase.ts` into a
  client component or expose it via `NEXT_PUBLIC_*`.
- **Network is testnet** (hardcoded in `lib/receipt.ts`, `lib/stacks.ts`). Mainnet is
  not wired — don't assume it is.
- **Never commit secrets.** `.env*.local` and `contracts/settings/Testnet.toml` are
  gitignored; keep it that way.

## 6. Additional Documentation

- [`.claude/docs/architecture.md`](.claude/docs/architecture.md) — repo layout, request
  lifecycle, the full x402 flow and error-status map.
- [`.claude/docs/contracts.md`](.claude/docs/contracts.md) — Clarity contracts,
  functions, error codes, receipt model, deployed testnet address.
- [`.claude/docs/payments.md`](.claude/docs/payments.md) — wallet connect, post-conditions
  with `Pc`, `waitForTx` states, slow-confirmation recovery.
- [`.claude/docs/data-model.md`](.claude/docs/data-model.md) — Supabase schema, invoice
  state machine, atomic locks, stale-lock recovery, migrations.
- [`.claude/docs/llm-providers.md`](.claude/docs/llm-providers.md) — provider abstraction,
  env config, output contract and parsing.
