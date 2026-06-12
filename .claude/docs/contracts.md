# Clarity Contracts

Project: `contracts/` (Clarinet, Clarity v4). Three contracts.

## Deployed (testnet)

- `thread-pay`: **`ST2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB4PBYSC2.thread-pay`**
- `owner` and `treasury` default to the deployer (the address above).
- The frontend reads the contract id from `NEXT_PUBLIC_CONTRACT`.

## `thread-pay.clar`

Records a payment receipt per invoice. The receipt map is the source of truth the
backend trusts; the DB only mirrors it.

```clarity
(define-map receipts (buff 32)
  { payer: principal, amount: uint, token: (string-ascii 4), paid-at: uint })
```

### Public functions

| Function | Args | Notes |
|----------|------|-------|
| `pay-stx` | `(invoice-id (buff 32)) (amount uint)` | transfers STX `tx-sender → treasury`, writes receipt `token="STX"` |
| `pay-sbtc` | `(token <ft-trait>) (invoice-id (buff 32)) (amount uint)` | `token` must equal `sbtc-contract`; writes `token="SBTC"` |
| `set-prices` | `(stx uint) (sbtc uint)` | owner only |
| `set-sbtc-contract` | `(principal)` | owner only |
| `set-treasury` | `(principal)` | owner only |

### Read-only

- `get-receipt (invoice-id (buff 32))` → `(optional {payer,amount,token,paid-at})`
- `get-prices` → `{ stx: uint, sbtc: uint }`

### Error codes

| Code | Constant | Cause |
|------|----------|-------|
| `u100` | `ERR-UNDERPAID` | `amount < min-price` |
| `u101` | `ERR-DUPLICATE-INVOICE` | invoice id already has a receipt |
| `u102` | `ERR-NOT-OWNER` | admin fn called by non-owner |
| `u103` | `ERR-WRONG-TOKEN` | `pay-sbtc` token ≠ `sbtc-contract` |

### Invariants

- **Price is a minimum.** `amount >= min-price`; overpayment is allowed and recorded.
- **Invoice id is single-use on-chain.** A second `pay-*` with the same id fails with
  `u101` — this is the on-chain anti-replay guard.
- Defaults: `min-price-stx = u100000` (0.1 STX), `min-price-sbtc = u100` (100 sats).
- `sbtc-contract` default: `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token`.
- `paid-at` is `burn-block-height`.

## `traits.clar`

Minimal fungible-token trait — just `transfer`. sBTC (SIP-010) satisfies it, so
`pay-sbtc` takes any `<ft-trait>` but rejects anything but the configured `sbtc-contract`.

## `mock-sbtc.clar`

SIP-010 mock with a `mint` helper. **Simnet tests only** — never relied on in prod.
(It is also deployed to testnet but unused by the app; harmless.)

## Working on contracts

```bash
cd contracts
clarinet check        # types
npm test              # simnet tests (tests/thread-pay.test.ts)
```

Use TDD: tests assert receipt shape, underpaid/duplicate rejection, token mismatch, and
owner-gating. Keep the `token` string `"STX"`/`"SBTC"` in sync with the TS `Receipt` type
in `frontend/src/lib/receipt.ts`.
