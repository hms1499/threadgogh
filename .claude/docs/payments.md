# Payments & Wallet (client)

All client-side chain interaction is in `frontend/src/lib/stacks.ts`. UI flow is driven
by `app/page.tsx`.

## Wallet connect / disconnect

- `connectWallet()` → `connect()` then reads the STX address from `getLocalStorage()`.
- `disconnectWallet()` → `disconnect()`. **Must be called on disconnect** — clearing only
  React state leaves the `@stacks/connect` session in localStorage, so reconnect silently
  returns the same wallet without a picker. (`page.tsx` `toggleWallet` calls it.)

## Post-conditions are mandatory

The wallet runs **deny mode**: any asset a contract-call moves must be declared in a
post-condition, or the tx is mined-but-rolled-back with:

> Post-condition check failure: ... was moved by ... but not checked

`pay-stx` moves STX and `pay-sbtc` moves the FT, so `payInvoice` attaches an exact
post-condition built with `Pc` from `@stacks/transactions`:

```ts
// STX
Pc.principal(sender).willSendEq(amount).ustx()
// sBTC (asset name for the sbtc-token contract is 'sbtc-token')
Pc.principal(sender).willSendEq(amount).ft(SBTC_CONTRACT as `${string}.${string}`, 'sbtc-token')
```

`sender` is the signer from `getAddress()`. Keep `postConditionMode: 'deny'` — with the
exact post-condition it's the safest (only the invoice amount can leave the wallet).
Any new token-moving contract-call must add its own post-condition.

## `waitForTx` — three states, not two

```ts
waitForTx(txid): Promise<'success' | 'failed' | 'pending'>
```

- `success` — tx confirmed OK.
- `failed` — anchored but reverted (`abort_by_response` / `abort_by_post_condition`).
  A real failure; surface an error.
- `pending` — polling **timed out** (~2.7 min) and the tx is still unconfirmed. This is
  **not** a failure. Never tell the user the payment failed here — funds may still land.

## Slow-confirmation recovery

When `waitForTx` returns `pending` (or a redeem POST returns 402/202), `page.tsx` enters
the `recover` phase instead of erroring:

- it stores `pendingInvoiceId`,
- shows a warning + a **"Check payment"** button,
- the button calls `redeem(invoiceId, txid)` which re-POSTs `/api/generate`.

`redeem()` never throws — 402/202 loop back into `recover`; only unexpected errors go to
the `error` phase. This guarantees a paid user can always re-fetch their thread, even
after closing the tab: re-POST `/api/generate` with the invoiceId and the consumed
invoice returns the cached thread.

## Confirmation depth / reorg risk (accepted)

`fetchReceipt` reads the contract's **current chain tip** via a read-only call; the
server verifies the receipt and generates immediately, with no confirmation-depth wait.
We deliberately do **not** gate generation on N confirmations (e.g. comparing the
current burn height against the receipt's `paid-at`), and `paid-at` is recorded for
audit only — never used as a gate.

Why this is safe:

- **No economic upside.** The only failure mode is a micro-reorg that un-mines a payment
  *after* the thread was generated. The payment (`>= 0.1 STX` / `100 sats`) is on the
  order of one generation's cost, so a reorged-away payment yields no profit.
- **An attacker can't induce it.** Causing a Stacks reorg requires Bitcoin miner
  collusion; it isn't something a caller can trigger on demand. Natural micro-reorgs are
  rare and shallow.
- **A confirmation wait would hurt more than it helps.** Blocking generation for N
  confirmations adds minutes of latency to every paid request to defend against a
  near-zero, unprofitable risk — a net-negative trade.

If economics change (much higher prices, or batching many generations under one
payment), revisit this: gate on `burn-block-height - paid-at >= N` before generating.
