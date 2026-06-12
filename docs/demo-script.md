# ThreadPay — 2-Minute Demo Script

A pay-per-call AI service settled on Bitcoin/Stacks: generate an X thread, pay per
generation with STX or sBTC via an x402 flow. No account, no subscription, no API key —
a Stacks wallet is the only login.

## Pre-demo checklist (do this BEFORE you present)

- [ ] Dev server running: `cd frontend && npm run dev` → http://localhost:3000
- [ ] Leather/Xverse set to **Testnet**, funded with testnet STX (faucet:
      `https://api.testnet.hiro.so/extended/v1/faucets/stx?address=<ST...>`)
- [ ] A little testnet **sBTC** for the second token (faucet: platform.hiro.so or
      app.testnet.sbtc.tech)
- [ ] `frontend/.env.local` filled (Supabase URL/service key, `GROQ_API_KEY`,
      `NEXT_PUBLIC_CONTRACT`)
- [ ] One thread pre-generated earlier so History/stats aren't empty on screen
- [ ] Explorer tab open (see links below) in case you want to show the receipt

## Reference

- **Contract (testnet):** `ST2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB4PBYSC2.thread-pay`
- **Contract explorer:**
  https://explorer.hiro.so/txid/ST2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB4PBYSC2.thread-pay?chain=testnet
- **A payment tx:** `https://explorer.hiro.so/txid/<TXID>?chain=testnet`
- Default price: 0.1 STX (`100000` µSTX) or 100 sats sBTC.
- Sample topics that demo well: *"Why Bitcoin needs a layer 2"*,
  *"How sBTC brings Bitcoin into DeFi"*, *"3 myths about Stacks"*.

## The script (~2 min)

**0:00 — Frame it (15s).**
"This is ThreadPay. It's an AI thread writer, but there's no signup and no monthly plan —
you pay a few cents per generation, on-chain, with Bitcoin. The payment *is* the API key.
It uses an x402 flow: the server answers HTTP 402 with an invoice, you pay a Clarity
contract, the contract writes a receipt, and the server only generates after it verifies
that receipt on-chain."

**0:15 — STX path (45s).**
1. Type topic *"Why Bitcoin needs a layer 2"*, pick a tone, **8 tweets**, token **STX**.
2. Click **Generate** → the status strip shows `Quote (402) → Sign`. The wallet pops up,
   and note it shows the exact post-condition: "send 0.1 STX" — nothing more can leave.
3. Sign → `Confirm` with a live explorer link → `Generate` → the thread renders as tweet
   cards with per-tweet character counts. Hit **Copy whole thread**.

**1:00 — sBTC path (30s).**
4. Switch token to **sBTC**, generate a second thread. Same flow, paid in Bitcoin-backed
   sBTC. Point out the receipt's token is `SBTC` on-chain.

**1:30 — Proof + recovery (20s).**
5. Scroll to the footer stats: threads sold and **on-chain revenue** tick up — real money,
   verifiable. Open the **History** panel: every purchase is replayable by wallet.
6. One-liner on robustness: "Payment is verified from the on-chain receipt, generation is
   idempotent, and if confirmation is slow you get a *Check payment* button instead of a
   lost payment — the money is always recoverable."

**1:50 — Close (10s).**
"So: a self-serve AI micro-service, settled per call on Bitcoin, no accounts. The same
x402 pattern works for any paid API."

## If something breaks live

- **Testnet confirmation is slow.** Don't wait on stage — the app enters the `recover`
  phase with a **Check payment** button; click it once the explorer shows `success`.
  Worst case, show the pre-generated thread from **History** and narrate the flow.
- **Wallet won't re-prompt accounts.** Disconnect in the header (clears the session); if it
  still auto-connects, remove `localhost:3000` from the wallet's Connected Sites.
- **Post-condition error.** Means a build without the `Pc` post-conditions — you're on old
  code; pull latest (`frontend/src/lib/stacks.ts`).
- **Generation fails (LLM).** The invoice is preserved (status released); just retry — no
  second payment. Or switch `LLM_PROVIDER` in `.env.local` and restart.

## Error branches worth showing (optional, for technical judges)

- Re-POST the same `invoiceId` twice → both return the same thread, DB has one
  `generations` row (atomic anti-double-spend).
- Pay an already-expired invoice → still honored, because the on-chain receipt is checked
  before expiry. No lost funds.
