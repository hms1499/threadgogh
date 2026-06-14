# ThreadGogh 🌌

**AI writes your X (Twitter) threads — you pay per generation, on-chain, with Bitcoin.**
No accounts. No subscriptions. The payment *is* the API key.

ThreadGogh generates threads with an LLM and charges per generation via an
[x402](https://www.x402.org/)-style flow on [Stacks](https://www.stacks.co/): the API
answers `HTTP 402` with an invoice, you pay STX or sBTC to a Clarity contract that records
a receipt on-chain, and the server verifies that receipt before generating. Wrapped in a
Van Gogh *Starry Night* interface where each tweet hangs as a framed painting.

---

## How it works

```
┌────────┐   1. POST /api/generate {topic,tone,length}      ┌──────────────┐
│ Client │ ───────────────────────────────────────────────▶ │  Next.js API │
│ (wallet)│  ◀─────────────── HTTP 402 + invoice + price ──── │              │
└────────┘                                                    └──────┬───────┘
     │ 2. sign pay-stx / pay-sbtc (with post-conditions)             │
     ▼                                                               │
┌─────────────────────────┐   stores receipt keyed by invoice-id    │
│ Clarity contract         │ ◀───────────────────────────────────── │
│ thread-pay (on Stacks)   │                                         │
└─────────────────────────┘                                         │
     │ 3. POST /api/generate {invoiceId, txId}                       ▼
     │                          read receipt on-chain ──▶ verify amount ≥ price
     │                          ──▶ atomic DB lock ──▶ LLM ──▶ persist ──▶ thread
```

1. **Quote** — `POST /api/generate` with `{topic, tone, length}` creates an invoice
   (random 32-byte id) and returns **HTTP 402** + price + contract id.
2. **Pay** — the wallet signs `pay-stx` / `pay-sbtc` on the `thread-pay` contract, which
   stores a receipt keyed by the invoice id (price is a minimum: `amount ≥ min-price`).
3. **Redeem** — `POST /api/generate` with `{invoiceId, txId}`; the server reads the receipt
   **on-chain** (the source of truth for payment), checks `amount ≥ quoted price`, then
   generates and persists the thread.

An atomic DB lock (`pending → generating → consumed`) plus an on-chain
duplicate-invoice guard make generation idempotent and double-spend-safe — a late-confirmed
payment is still honored, so a paying user never loses funds.

## Features

- 💸 **Pay-per-generate** in STX or sBTC — no signup, no monthly plan.
- 🔗 **On-chain receipts** as the single source of truth for payment.
- 🔒 **Double-spend safe** — on-chain `ERR-DUPLICATE-INVOICE` + a DB unique constraint.
- 🧵 **Three tones × three lengths**, parsed into per-tweet cards with a 280-char meter.
- 🪪 **Sign-in-with-Stacks** — history is gated behind a free wallet signature.
- 🎨 **Van Gogh theme** — framed-painting tweets, swirling-sky loader, ken-burns hero.
- 🔌 **Pluggable LLM** — Groq (free default), Gemini, OpenRouter, or local Ollama.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend + API | Next.js 16 (App Router, **webpack**), React 19, TypeScript 5 |
| UI | Ant Design 6, Tailwind 4, React Compiler |
| Wallet / chain | `@stacks/connect`, `@stacks/transactions` |
| Database | Supabase (Postgres) — invoices & generations |
| Contracts | Clarinet / Clarity v4 |
| LLM | provider-agnostic (Groq default) — **not** the Claude API |
| Tests | Vitest (route, lib, and Clarinet simnet) |

> ⚠️ **Webpack only.** `dev`/`build` use `--webpack`; Turbopack breaks
> `@stacks/transactions` (WASM/bundling). Don't remove the flag.

## Repository layout

```
threadgogh/
├── frontend/              # Next.js app (UI + API routes)
│   ├── src/app/           # pages + /api routes
│   ├── src/lib/           # invoices, receipt, stacks, auth, LLM, env
│   ├── src/components/    # ThreadForm, TweetCard, HistoryPanel, …
│   └── supabase/          # schema.sql + migrations
├── contracts/             # Clarity contracts (thread-pay, traits, mock-sbtc)
└── .claude/docs/          # deep-dive docs (architecture, contracts, payments, …)
```

## Getting started

### 1. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000  (next dev --webpack)
```

Apply the database schema in the [Supabase](https://supabase.com) SQL editor:
`frontend/supabase/schema.sql`, then any files in `frontend/supabase/migrations/`.

### 2. Environment

See `frontend/.env.example`. Key variables:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Postgres access (server-only) |
| `PRICE_STX`, `PRICE_SBTC` | quoted price — **must equal** the on-chain `min-price` |
| `LLM_PROVIDER`, `GROQ_API_KEY` | LLM provider + key (Groq is free) |
| `NEXT_PUBLIC_STACKS_NETWORK` | `testnet` (default) or `mainnet` |
| `NEXT_PUBLIC_CONTRACT` | `<deployer>.thread-pay` |
| `NEXT_PUBLIC_SBTC_CONTRACT` | sBTC token contract for the network |
| `NEXT_PUBLIC_HIRO_API` | Hiro API base URL for the network |

Server env is validated fail-fast at boot (`instrumentation.ts → lib/env.ts`), including
network consistency (a mainnet build wired to testnet values is rejected).

### 3. Contracts

```bash
cd contracts
clarinet check        # type-check Clarity
npm test              # simnet unit tests (Vitest)
```

## Deployed contract

| Network | Contract id |
|---|---|
| Testnet | `ST2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB4PBYSC2.thread-pay` |
| Mainnet | `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.thread-pay` |

The contract: `pay-stx` / `pay-sbtc` (store receipts), `get-receipt` / `get-prices`
(read-only), and owner-only `set-prices` / `set-sbtc-contract` / `set-treasury`.

## Commands

```bash
# frontend/
npm run dev      # dev server (webpack)
npm run build    # production build (webpack)
npm test         # Vitest
npm run lint     # ESLint

# contracts/
clarinet check
npm test
```

## Deploying

- **Frontend → Vercel:** import the repo, set **Root Directory = `frontend`**,
  **Build Command = `npm run build`** (keeps `--webpack`), and add the env vars above.
- **Contract → mainnet:** follow the ordered runbook in
  [`.claude/docs/mainnet-deploy.md`](.claude/docs/mainnet-deploy.md) (deploy without
  `mock-sbtc`, then `set-sbtc-contract`, RLS, env switch, smoke test).

## Further reading

Deep dives live in [`.claude/docs/`](.claude/docs/): `architecture.md`, `contracts.md`,
`payments.md`, `data-model.md`, `llm-providers.md`, `mainnet-deploy.md`.

## Notes

- The LLM is pluggable and **not** the Anthropic/Claude API — switch with `LLM_PROVIDER`.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only; never expose it via `NEXT_PUBLIC_*`.
- The Clarity contract id is `thread-pay` (on-chain identity) even though the product is
  branded ThreadGogh.
