# Mainnet deployment runbook

Pre-flight review verdict: the core flow (on-chain receipt as source of truth,
two-layer double-spend protection, idempotent generation, late-payment honoring)
is sound. The work below is the testnet→mainnet switch plus the security
lock-downs. Do these **in order**. Items marked 🔧 are code/SQL already in the
repo; items marked 🖐 require keys / real funds and must be run by you.

## 0. Prerequisites
- Mainnet STX in the deployer wallet for deploy fees (~0.05–0.1 STX) + a little
  extra for the post-deploy admin calls.
- The deployer mnemonic in `contracts/settings/Mainnet.toml` (gitignored — never
  commit). This key becomes the contract **owner + treasury**; treat it as cold.
- A little real STX and sBTC in a *test* wallet to run the smoke test (step 7).

## 1. 🔧🖐 Deploy plan WITHOUT mock-sbtc
`mock-sbtc.clar` is a fake token for tests — it must **never** reach mainnet.
Only `traits` and `thread-pay` are needed (thread-pay references the real sBTC
contract at runtime via a data-var, not at deploy time).

```bash
cd contracts
clarinet deployments generate --mainnet --low-cost
```

Then open `deployments/default.mainnet-plan.yaml` and **delete the entire
`contract-publish` transaction block for `mock-sbtc`**. Leave `traits` first,
then `thread-pay` (order matters — thread-pay uses `.traits`). Verify only two
`contract-name:` entries remain.

## 2. 🖐 Deploy
```bash
clarinet deployments apply --mainnet --no-dashboard -d   # review cost + sender first
```
Record the deployer address — that is the `SP...` principal for
`NEXT_PUBLIC_CONTRACT=SP...DEPLOYER.thread-pay`.

## 3. 🖐 Point the contract at mainnet sBTC  ⚠️ REQUIRED
The contract ships with a **testnet** sBTC default
(`ST1F7QA2…sbtc-token`). On mainnet every `pay-sbtc` will revert
`ERR-WRONG-TOKEN (u103)` until you fix this. Call `set-sbtc-contract` (owner-only)
with the mainnet sBTC token — verify the current address on
https://docs.hiro.so/sbtc (mainnet sBTC is
`SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token` at time of writing).

## 4. 🖐 Align prices (optional but recommended)
The contract deploys with `min-price-stx = 100000` (0.1 STX) and
`min-price-sbtc = 100` sats — matching the default env `PRICE_STX` / `PRICE_SBTC`.
If you change pricing, call `set-prices` AND update the env so the two stay
**exactly equal** (see the warning in `.env.example`: an env price above the
on-chain min lets a user pay the min, get accepted on-chain, and still be
rejected as underpaid — losing funds).

## 5. 🔧🖐 Enable Supabase RLS
Run `frontend/supabase/migrations/0002_enable_rls.sql` in the Supabase SQL editor
(already applied automatically for fresh setups via `schema.sql`). Without it the
public anon role can read every invoice/generation through PostgREST. The server
uses the service-role key, which bypasses RLS, so the app keeps working.

## 6. 🖐 Frontend env (switch all four together)
In production env (Vercel / host), set:
```
NEXT_PUBLIC_STACKS_NETWORK=mainnet
NEXT_PUBLIC_CONTRACT=SP...DEPLOYER.thread-pay
NEXT_PUBLIC_SBTC_CONTRACT=SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
NEXT_PUBLIC_HIRO_API=https://api.hiro.so
```
Server vars (`SUPABASE_*`, `PRICE_*`, LLM key) stay. Boot will fail-fast via
`instrumentation.ts → assertServerEnv` if anything required is missing.

## 7. 🖐 Smoke test with real (small) funds
Before announcing: from a test wallet on mainnet, run **one STX** generation and
**one sBTC** generation end-to-end. Confirm: 402 quote → wallet sign → tx confirms
→ thread returns → receipt visible on the explorer → history + stats update.

## 8. 🖐 Key hygiene
The deployer key is owner + treasury (controls prices, treasury, sbtc-contract).
Keep the mnemonic offline. Consider `set-treasury` to move payouts to a separate
cold wallet, leaving only admin on the deployer.

## Known accepted risks (not blockers)
- **`/api/history` is unauthenticated** — anyone can read a given address's
  threads by passing the address. Pseudonymous, but a privacy leak. Follow-up:
  require a wallet-signed message to prove address ownership.
- **`waitForTx` polls ~160s** — usually enough post-Nakamoto; slow blocks fall
  into the existing "Check payment" recovery path (no funds lost).
- **`/api/stats` selects all rows** — fine now, switch to a SQL aggregate as the
  table grows.
