# ThreadPay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web app generate thread X bằng AI, thu phí mỗi lần generate bằng STX/sBTC qua chuẩn x402 trên Stacks testnet.

**Architecture:** Clarity contract `thread-pay` nhận tiền và lưu receipt on-chain (nguồn sự thật về thanh toán). Next.js app: API route trả 402 kèm invoice, verify receipt qua read-only call, gọi Claude API generate, lưu kết quả vào Supabase. Frontend dùng @stacks/connect để ký contract-call từ ví Leather/Xverse.

**Tech Stack:** Clarinet + Clarity, Next.js 15 (App Router, TypeScript), @stacks/connect, @stacks/transactions, Supabase (Postgres), @anthropic-ai/sdk (model `claude-sonnet-4-6`), vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-threadpay-design.md`

---

## Cấu trúc file toàn dự án

```
threadpay/
├── contracts/                          # Clarinet project
│   ├── Clarinet.toml
│   ├── contracts/
│   │   ├── traits.clar                 # ft-trait tối giản (transfer)
│   │   ├── mock-sbtc.clar              # SIP-010 mock cho simnet tests
│   │   └── thread-pay.clar             # contract chính
│   └── tests/
│       └── thread-pay.test.ts          # Clarinet simnet tests (vitest)
└── frontend/                                # Next.js app
    ├── .env.example
    ├── vitest.config.ts
    └── src/
        ├── lib/
        │   ├── config.ts               # env, giá, địa chỉ contract
        │   ├── supabase.ts             # server client (service role)
        │   ├── invoices.ts             # CRUD invoice + atomic consume
        │   ├── receipt.ts              # fetch + parse receipt on-chain
        │   ├── generate-thread.ts      # Claude API + parse output
        │   ├── stacks.ts               # client-side: connect ví, pay, wait tx
        │   └── __tests__/
        │       ├── receipt.test.ts
        │       └── generate-thread.test.ts
        ├── app/
        │   ├── page.tsx                # trang chính (client component)
        │   └── api/
        │       ├── generate/route.ts           # POST: 402 quote / verify+generate
        │       ├── generation/[invoiceId]/route.ts  # GET: lấy lại kết quả
        │       ├── history/route.ts            # GET: lịch sử theo ví
        │       └── stats/route.ts              # GET: dashboard mini
        └── components/
            ├── ThreadForm.tsx          # topic/tone/length/token
            ├── PaymentStatus.tsx       # tiến trình 402→ký→confirm→generate
            ├── TweetCard.tsx           # 1 tweet + đếm ký tự + copy
            └── HistoryPanel.tsx        # threads đã mua theo ví
```

**Hằng số dùng xuyên suốt (phải khớp giữa các task):**
- Giá mặc định: `100000` µSTX (0.1 STX) và `100` sats sBTC.
- Token string trong receipt: `"STX"` hoặc `"SBTC"` (string-ascii 4).
- Invoice id: 32 bytes random, hex 64 ký tự, là `(buff 32)` trên contract.
- sBTC testnet: `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token`.
- Hiro testnet API: `https://api.testnet.hiro.so`.

---

### Task 1: Scaffold Clarinet project + Next.js app

**Files:**
- Create: `contracts/` (clarinet new), `frontend/` (create-next-app), `.gitignore`

- [ ] **Step 1: Tạo Clarinet project**

```bash
cd ~/Desktop/threadpay
clarinet new contracts
cd contracts
clarinet contract new traits
clarinet contract new mock-sbtc
clarinet contract new thread-pay
```

Expected: `Clarinet.toml` + 3 file `.clar` trống trong `contracts/contracts/` + test scaffold trong `contracts/tests/`. Nếu `clarinet` chưa cài: `brew install clarinet`.

- [ ] **Step 2: Xóa test scaffold không dùng**

```bash
rm -f contracts/tests/traits.test.ts contracts/tests/mock-sbtc.test.ts
```

- [ ] **Step 3: Tạo Next.js app**

```bash
cd ~/Desktop/threadpay
npx create-next-app@latest frontend --typescript --app --tailwind --eslint --src-dir --use-npm --no-import-alias --yes
cd frontend
npm i @stacks/connect @stacks/transactions @supabase/supabase-js @anthropic-ai/sdk
npm i -D vitest
```

- [ ] **Step 4: Thêm script test vào `frontend/package.json`**

Trong `"scripts"` thêm: `"test": "vitest run"`.

- [ ] **Step 5: Tạo `frontend/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/threadpay
git add -A
git commit -m "chore: scaffold clarinet project and next.js app"
```

---

### Task 2: Contract `traits` + `mock-sbtc`

**Files:**
- Modify: `contracts/contracts/traits.clar`
- Modify: `contracts/contracts/mock-sbtc.clar`

- [ ] **Step 1: Viết `traits.clar`**

```clarity
;; Trait toi gian cho fungible token: chi can ham transfer.
;; sBTC token that cung khop signature nay (SIP-010).
(define-trait ft-trait
  (
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
  )
)
```

- [ ] **Step 2: Viết `mock-sbtc.clar`** (chỉ dùng cho simnet tests)

```clarity
(impl-trait .traits.ft-trait)

(define-fungible-token mock-sbtc)

(define-constant ERR-NOT-SENDER (err u4))

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-SENDER)
    (ft-transfer? mock-sbtc amount sender recipient)
  )
)

(define-public (mint (amount uint) (recipient principal))
  (ft-mint? mock-sbtc amount recipient)
)
```

- [ ] **Step 3: Check cú pháp**

```bash
cd ~/Desktop/threadpay/contracts && clarinet check
```

Expected: `✔ 3 contracts checked` (thread-pay còn trống vẫn pass).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(contracts): add ft-trait and mock sbtc token"
```

---

### Task 3: Contract `thread-pay` — pay-stx (TDD)

**Files:**
- Modify: `contracts/contracts/thread-pay.clar`
- Modify: `contracts/tests/thread-pay.test.ts`

- [ ] **Step 1: Viết failing tests cho pay-stx**

Thay toàn bộ `contracts/tests/thread-pay.test.ts` bằng:

```ts
import { describe, expect, it } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

const invoiceA = new Uint8Array(32).fill(1);
const invoiceB = new Uint8Array(32).fill(2);

describe('pay-stx', () => {
  it('ghi receipt khi tra du gia toi thieu', () => {
    const res = simnet.callPublicFn(
      'thread-pay', 'pay-stx',
      [Cl.buffer(invoiceA), Cl.uint(100000)], wallet1,
    );
    expect(res.result).toBeOk(Cl.bool(true));

    const receipt = simnet.callReadOnlyFn(
      'thread-pay', 'get-receipt', [Cl.buffer(invoiceA)], wallet1,
    );
    expect(receipt.result).toBeSome(
      Cl.tuple({
        payer: Cl.principal(wallet1),
        amount: Cl.uint(100000),
        token: Cl.stringAscii('STX'),
        'paid-at': Cl.uint(simnet.burnBlockHeight),
      }),
    );
  });

  it('reject khi tra thieu (ERR-UNDERPAID u100)', () => {
    const res = simnet.callPublicFn(
      'thread-pay', 'pay-stx',
      [Cl.buffer(invoiceA), Cl.uint(99999)], wallet1,
    );
    expect(res.result).toBeErr(Cl.uint(100));
  });

  it('reject invoice-id trung (ERR-DUPLICATE-INVOICE u101)', () => {
    const first = simnet.callPublicFn(
      'thread-pay', 'pay-stx',
      [Cl.buffer(invoiceB), Cl.uint(100000)], wallet1,
    );
    expect(first.result).toBeOk(Cl.bool(true));
    const second = simnet.callPublicFn(
      'thread-pay', 'pay-stx',
      [Cl.buffer(invoiceB), Cl.uint(100000)], wallet2,
    );
    expect(second.result).toBeErr(Cl.uint(101));
  });

  it('get-receipt tra none cho invoice chua thanh toan', () => {
    const receipt = simnet.callReadOnlyFn(
      'thread-pay', 'get-receipt',
      [Cl.buffer(new Uint8Array(32).fill(9))], wallet1,
    );
    expect(receipt.result).toBeNone();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

```bash
cd ~/Desktop/threadpay/contracts && npm install && npm test
```

Expected: FAIL — `pay-stx` chưa tồn tại trong contract.

- [ ] **Step 3: Viết `thread-pay.clar` phần pay-stx**

```clarity
(use-trait ft-trait .traits.ft-trait)

(define-constant ERR-UNDERPAID (err u100))
(define-constant ERR-DUPLICATE-INVOICE (err u101))
(define-constant ERR-NOT-OWNER (err u102))
(define-constant ERR-WRONG-TOKEN (err u103))

(define-data-var owner principal tx-sender)
(define-data-var treasury principal tx-sender)
(define-data-var min-price-stx uint u100000)  ;; 0.1 STX
(define-data-var min-price-sbtc uint u100)    ;; 100 sats
(define-data-var sbtc-contract principal 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token)

(define-map receipts (buff 32)
  { payer: principal, amount: uint, token: (string-ascii 4), paid-at: uint })

(define-read-only (get-receipt (invoice-id (buff 32)))
  (map-get? receipts invoice-id))

(define-read-only (get-prices)
  { stx: (var-get min-price-stx), sbtc: (var-get min-price-sbtc) })

(define-public (pay-stx (invoice-id (buff 32)) (amount uint))
  (begin
    (asserts! (>= amount (var-get min-price-stx)) ERR-UNDERPAID)
    (asserts! (is-none (map-get? receipts invoice-id)) ERR-DUPLICATE-INVOICE)
    (try! (stx-transfer? amount tx-sender (var-get treasury)))
    (map-set receipts invoice-id
      { payer: tx-sender, amount: amount, token: "STX", paid-at: burn-block-height })
    (ok true)
  )
)
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

```bash
npm test
```

Expected: 4 tests PASS. (Nếu test `paid-at` lệch 1 block, đọc `simnet.burnBlockHeight` TRƯỚC khi gọi `callPublicFn` và dùng giá trị đó trong assert.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(contracts): thread-pay pay-stx with on-chain receipts"
```

---

### Task 4: Contract `thread-pay` — pay-sbtc + admin functions (TDD)

**Files:**
- Modify: `contracts/contracts/thread-pay.clar`
- Modify: `contracts/tests/thread-pay.test.ts`

- [ ] **Step 1: Thêm failing tests**

Thêm vào cuối `thread-pay.test.ts`:

```ts
describe('pay-sbtc', () => {
  const invoiceC = new Uint8Array(32).fill(3);

  function setupMockSbtc() {
    // owner tro sbtc-contract ve mock, mint cho wallet1
    simnet.callPublicFn('thread-pay', 'set-sbtc-contract',
      [Cl.contractPrincipal(deployer, 'mock-sbtc')], deployer);
    simnet.callPublicFn('mock-sbtc', 'mint',
      [Cl.uint(10000), Cl.principal(wallet1)], deployer);
  }

  it('ghi receipt SBTC khi tra qua mock token', () => {
    setupMockSbtc();
    const res = simnet.callPublicFn(
      'thread-pay', 'pay-sbtc',
      [Cl.contractPrincipal(deployer, 'mock-sbtc'), Cl.buffer(invoiceC), Cl.uint(100)],
      wallet1,
    );
    expect(res.result).toBeOk(Cl.bool(true));

    const receipt = simnet.callReadOnlyFn(
      'thread-pay', 'get-receipt', [Cl.buffer(invoiceC)], wallet1,
    );
    expect(receipt.result).toBeSome(
      Cl.tuple({
        payer: Cl.principal(wallet1),
        amount: Cl.uint(100),
        token: Cl.stringAscii('SBTC'),
        'paid-at': Cl.uint(simnet.burnBlockHeight),
      }),
    );
  });

  it('reject token contract la (ERR-WRONG-TOKEN u103)', () => {
    // sbtc-contract dang la mock (set o test truoc trong cung file) —
    // goi voi traits contract khac se bi reject
    setupMockSbtc();
    simnet.callPublicFn('thread-pay', 'set-sbtc-contract',
      [Cl.contractPrincipal(deployer, 'thread-pay')], deployer);
    const res = simnet.callPublicFn(
      'thread-pay', 'pay-sbtc',
      [Cl.contractPrincipal(deployer, 'mock-sbtc'), Cl.buffer(new Uint8Array(32).fill(4)), Cl.uint(100)],
      wallet1,
    );
    expect(res.result).toBeErr(Cl.uint(103));
  });
});

describe('admin', () => {
  it('set-prices chi owner duoc goi (ERR-NOT-OWNER u102)', () => {
    const notOwner = simnet.callPublicFn(
      'thread-pay', 'set-prices', [Cl.uint(1), Cl.uint(1)], wallet1,
    );
    expect(notOwner.result).toBeErr(Cl.uint(102));

    const asOwner = simnet.callPublicFn(
      'thread-pay', 'set-prices', [Cl.uint(200000), Cl.uint(50)], deployer,
    );
    expect(asOwner.result).toBeOk(Cl.bool(true));

    const prices = simnet.callReadOnlyFn('thread-pay', 'get-prices', [], wallet1);
    expect(prices.result).toBeTuple({ stx: Cl.uint(200000), sbtc: Cl.uint(50) });
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `pay-sbtc`, `set-sbtc-contract`, `set-prices` chưa tồn tại.

```bash
npm test
```

- [ ] **Step 3: Thêm vào cuối `thread-pay.clar`**

```clarity
(define-public (pay-sbtc (token <ft-trait>) (invoice-id (buff 32)) (amount uint))
  (begin
    (asserts! (is-eq (contract-of token) (var-get sbtc-contract)) ERR-WRONG-TOKEN)
    (asserts! (>= amount (var-get min-price-sbtc)) ERR-UNDERPAID)
    (asserts! (is-none (map-get? receipts invoice-id)) ERR-DUPLICATE-INVOICE)
    (try! (contract-call? token transfer amount tx-sender (var-get treasury) none))
    (map-set receipts invoice-id
      { payer: tx-sender, amount: amount, token: "SBTC", paid-at: burn-block-height })
    (ok true)
  )
)

(define-public (set-prices (stx-price uint) (sbtc-price uint))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR-NOT-OWNER)
    (var-set min-price-stx stx-price)
    (var-set min-price-sbtc sbtc-price)
    (ok true)
  )
)

(define-public (set-sbtc-contract (new-contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR-NOT-OWNER)
    (var-set sbtc-contract new-contract)
    (ok true)
  )
)

(define-public (set-treasury (new-treasury principal))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR-NOT-OWNER)
    (var-set treasury new-treasury)
    (ok true)
  )
)
```

- [ ] **Step 4: Chạy test, xác nhận toàn bộ PASS**

```bash
npm test
```

Expected: 7 tests PASS, `clarinet check` sạch.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(contracts): pay-sbtc via ft-trait and admin functions"
```

---

### Task 5: Deploy contract lên testnet

**Files:**
- Modify: `contracts/settings/Testnet.toml`
- Create: `contracts/deployments/default.testnet-plan.yaml` (generated)

- [ ] **Step 1: Xác minh sBTC testnet contract tồn tại**

```bash
curl -s "https://api.testnet.hiro.so/extended/v1/contract/ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token" | head -c 300
```

Expected: JSON có `"tx_id"`. Nếu 404, tìm địa chỉ sBTC testnet hiện hành trong docs.hiro.so/sbtc và cập nhật data-var `sbtc-contract` trong `thread-pay.clar` + `NEXT_PUBLIC_SBTC_CONTRACT` (Task 6).

- [ ] **Step 2: Cấu hình ví deploy trong `contracts/settings/Testnet.toml`**

```toml
[network]
name = "testnet"

[accounts.deployer]
mnemonic = "<24 tu mnemonic cua vi testnet — KHONG commit file nay>"
```

Thêm vào `.gitignore` gốc repo: `contracts/settings/Testnet.toml`.

- [ ] **Step 3: Xin STX faucet cho địa chỉ deployer**

```bash
curl -X POST "https://api.testnet.hiro.so/extended/v1/faucets/stx?address=<DIA_CHI_ST_CUA_DEPLOYER>"
```

Expected: JSON có `"success": true`. Chờ ~1 phút rồi kiểm tra số dư:

```bash
curl -s "https://api.testnet.hiro.so/extended/v1/address/<DIA_CHI>/balances" | head -c 200
```

- [ ] **Step 4: Generate + apply deployment**

```bash
cd ~/Desktop/threadpay/contracts
clarinet deployments generate --testnet --low-cost
clarinet deployments apply --testnet
```

Expected: 3 contracts deployed (traits, mock-sbtc, thread-pay). Ghi lại địa chỉ deployer — đây là `NEXT_PUBLIC_CONTRACT` cho Task 6.

- [ ] **Step 5: Smoke test get-prices trên testnet**

```bash
curl -s -X POST "https://api.testnet.hiro.so/v2/contracts/call-read/<DEPLOYER>/thread-pay/get-prices" \
  -H 'Content-Type: application/json' \
  -d '{"sender":"<DEPLOYER>","arguments":[]}'
```

Expected: `{"okay":true,"result":"0x..."}`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore(contracts): testnet deployment plan"
```

---

### Task 6: Supabase schema + config + clients

**Files:**
- Create: `frontend/src/lib/config.ts`
- Create: `frontend/src/lib/supabase.ts`
- Create: `frontend/.env.example`, `frontend/.env.local` (không commit)

- [ ] **Step 1: Tạo Supabase project** (supabase.com → New project, free tier). Trong SQL Editor chạy:

```sql
create table invoices (
  invoice_id text primary key,
  topic text not null,
  tone text not null,
  length int not null,
  price_stx bigint not null,
  price_sbtc bigint not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'consumed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table generations (
  id bigint generated always as identity primary key,
  invoice_id text not null unique references invoices(invoice_id),
  payer_address text not null,
  token text not null,
  amount bigint not null,
  tx_id text not null,
  thread_content jsonb not null,
  created_at timestamptz not null default now()
);

create index generations_payer_idx on generations(payer_address);
```

- [ ] **Step 2: Viết `frontend/.env.example`**

```bash
# Server-only
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
PRICE_STX=100000
PRICE_SBTC=100

# Public (client-side)
NEXT_PUBLIC_CONTRACT=ST...DEPLOYER.thread-pay
NEXT_PUBLIC_SBTC_CONTRACT=ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token
NEXT_PUBLIC_HIRO_API=https://api.testnet.hiro.so
```

Copy thành `frontend/.env.local` và điền giá trị thật (CONTRACT lấy từ Task 5). Xác nhận `.env.local` đã nằm trong `.gitignore` của create-next-app.

- [ ] **Step 3: Viết `frontend/src/lib/config.ts`**

```ts
// Public — dung duoc o ca client va server
export const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT ?? '';
export const SBTC_CONTRACT =
  process.env.NEXT_PUBLIC_SBTC_CONTRACT ??
  'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token';
export const HIRO_API =
  process.env.NEXT_PUBLIC_HIRO_API ?? 'https://api.testnet.hiro.so';

// Server-only
export const PRICE_STX = Number(process.env.PRICE_STX ?? 100000);
export const PRICE_SBTC = Number(process.env.PRICE_SBTC ?? 100);
export const INVOICE_TTL_MINUTES = 15;

export const TONES = ['educational', 'funny', 'threadboi'] as const;
export type Tone = (typeof TONES)[number];
export const LENGTHS = [5, 8, 12] as const;
```

- [ ] **Step 4: Viết `frontend/src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

// Service-role client — CHI dung trong API routes (server).
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(frontend): supabase schema, config and clients"
```

---

### Task 7: Invoice library

**Files:**
- Create: `frontend/src/lib/invoices.ts`

- [ ] **Step 1: Viết `frontend/src/lib/invoices.ts`**

```ts
import crypto from 'crypto';
import { supabase } from './supabase';
import { PRICE_STX, PRICE_SBTC, INVOICE_TTL_MINUTES } from './config';

export type Invoice = {
  invoice_id: string;
  topic: string;
  tone: string;
  length: number;
  price_stx: number;
  price_sbtc: number;
  status: 'pending' | 'paid' | 'consumed';
  expires_at: string;
};

export function isExpired(invoice: Pick<Invoice, 'expires_at'>): boolean {
  return new Date(invoice.expires_at).getTime() < Date.now();
}

export async function createInvoice(
  topic: string, tone: string, length: number,
): Promise<Invoice> {
  const invoice: Invoice = {
    invoice_id: crypto.randomBytes(32).toString('hex'),
    topic, tone, length,
    price_stx: PRICE_STX,
    price_sbtc: PRICE_SBTC,
    status: 'pending',
    expires_at: new Date(Date.now() + INVOICE_TTL_MINUTES * 60_000).toISOString(),
  };
  const { error } = await supabase.from('invoices').insert(invoice);
  if (error) throw new Error(`createInvoice: ${error.message}`);
  return invoice;
}

export async function getInvoice(invoiceId: string): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('invoices').select('*').eq('invoice_id', invoiceId).maybeSingle();
  if (error) throw new Error(`getInvoice: ${error.message}`);
  return data;
}

export async function markPaid(invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('invoices').update({ status: 'paid' })
    .eq('invoice_id', invoiceId).eq('status', 'pending');
  if (error) throw new Error(`markPaid: ${error.message}`);
}

export type Generation = {
  invoice_id: string;
  payer_address: string;
  token: string;
  amount: number;
  tx_id: string;
  thread_content: string[];
};

export async function getGeneration(invoiceId: string): Promise<Generation | null> {
  const { data, error } = await supabase
    .from('generations').select('*').eq('invoice_id', invoiceId).maybeSingle();
  if (error) throw new Error(`getGeneration: ${error.message}`);
  return data;
}

// Atomic consume: unique constraint tren invoice_id la chot chong double-spend.
// Insert thanh cong → minh la nguoi dau tien → set consumed.
// Insert dinh unique violation (23505) → da co generation → tra ban cu.
export async function saveGenerationAndConsume(gen: Generation): Promise<Generation> {
  const { error } = await supabase.from('generations').insert(gen);
  if (error) {
    if (error.code === '23505') {
      const existing = await getGeneration(gen.invoice_id);
      if (existing) return existing;
    }
    throw new Error(`saveGeneration: ${error.message}`);
  }
  await supabase.from('invoices')
    .update({ status: 'consumed' }).eq('invoice_id', gen.invoice_id);
  return gen;
}
```

- [ ] **Step 2: Type-check**

```bash
cd ~/Desktop/threadpay/frontend && npx tsc --noEmit
```

Expected: không lỗi.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(frontend): invoice library with atomic consume"
```

---

### Task 8: Receipt verification library (TDD)

**Files:**
- Create: `frontend/src/lib/receipt.ts`
- Create: `frontend/src/lib/__tests__/receipt.test.ts`

- [ ] **Step 1: Viết failing test `receipt.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Cl } from '@stacks/transactions';
import { parseReceipt } from '../receipt';

const ADDR = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';

describe('parseReceipt', () => {
  it('parse some(tuple) thanh Receipt', () => {
    const cv = Cl.some(Cl.tuple({
      payer: Cl.standardPrincipal(ADDR),
      amount: Cl.uint(100000),
      token: Cl.stringAscii('STX'),
      'paid-at': Cl.uint(123),
    }));
    expect(parseReceipt(cv)).toEqual({
      payer: ADDR,
      amount: 100000n,
      token: 'STX',
      paidAt: 123n,
    });
  });

  it('tra null cho none', () => {
    expect(parseReceipt(Cl.none())).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

```bash
npm test
```

Expected: FAIL — `../receipt` chưa tồn tại.

- [ ] **Step 3: Viết `frontend/src/lib/receipt.ts`**

```ts
import {
  fetchCallReadOnlyFunction, Cl, cvToJSON, type ClarityValue,
} from '@stacks/transactions';
import { CONTRACT } from './config';

export type Receipt = {
  payer: string;
  amount: bigint;
  token: 'STX' | 'SBTC';
  paidAt: bigint;
};

export function parseReceipt(cv: ClarityValue): Receipt | null {
  const json = cvToJSON(cv);
  if (!json.value) return null; // none
  const t = json.value.value as Record<string, { value: string }>;
  return {
    payer: t['payer'].value,
    amount: BigInt(t['amount'].value),
    token: t['token'].value as 'STX' | 'SBTC',
    paidAt: BigInt(t['paid-at'].value),
  };
}

export async function fetchReceipt(invoiceIdHex: string): Promise<Receipt | null> {
  const [contractAddress, contractName] = CONTRACT.split('.');
  const result = await fetchCallReadOnlyFunction({
    contractAddress,
    contractName,
    functionName: 'get-receipt',
    functionArgs: [Cl.bufferFromHex(invoiceIdHex)],
    network: 'testnet',
    senderAddress: contractAddress,
  });
  return parseReceipt(result);
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

```bash
npm test
```

Expected: 2 tests PASS. (Nếu cấu trúc `cvToJSON` khác version, log thử `JSON.stringify(cvToJSON(cv))` trong test và chỉnh `parseReceipt` cho khớp — test chính là lưới an toàn cho việc này.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(frontend): on-chain receipt fetch and parse"
```

---

### Task 9: Thread generation với Claude API (TDD phần parse)

**Files:**
- Create: `frontend/src/lib/generate-thread.ts`
- Create: `frontend/src/lib/__tests__/generate-thread.test.ts`

- [ ] **Step 1: Viết failing test cho `parseThreadJson`**

```ts
import { describe, expect, it } from 'vitest';
import { parseThreadJson } from '../generate-thread';

describe('parseThreadJson', () => {
  it('parse JSON array tran', () => {
    expect(parseThreadJson('["tweet 1", "tweet 2"]')).toEqual(['tweet 1', 'tweet 2']);
  });

  it('parse khi bi boc trong code fence', () => {
    const raw = '```json\n["a", "b", "c"]\n```';
    expect(parseThreadJson(raw)).toEqual(['a', 'b', 'c']);
  });

  it('cat tweet vuot 280 ky tu', () => {
    const long = 'x'.repeat(300);
    const out = parseThreadJson(JSON.stringify([long]));
    expect(out[0].length).toBeLessThanOrEqual(280);
  });

  it('throw khi khong phai array of strings', () => {
    expect(() => parseThreadJson('{"a":1}')).toThrow();
    expect(() => parseThreadJson('not json')).toThrow();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

```bash
npm test
```

- [ ] **Step 3: Viết `frontend/src/lib/generate-thread.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk';
import type { Tone } from './config';

const TONE_GUIDE: Record<Tone, string> = {
  educational: 'clear, informative, expert but approachable tone',
  funny: 'witty, meme-aware humor, still delivers real substance',
  threadboi: 'punchy growth-hacker style, bold hooks, strategic emoji (incl. 🧵)',
};

export function parseThreadJson(raw: string): string[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('LLM output is not valid JSON');
  }
  if (!Array.isArray(parsed) || !parsed.every((t) => typeof t === 'string')) {
    throw new Error('LLM output is not a JSON array of strings');
  }
  return parsed.map((t: string) =>
    t.length > 280 ? `${t.slice(0, 277)}...` : t,
  );
}

export async function generateThread(
  topic: string, tone: Tone, length: number,
): Promise<string[]> {
  const anthropic = new Anthropic(); // doc ANTHROPIC_API_KEY tu env
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: [
      'You are an expert X (Twitter) thread writer.',
      'Return ONLY a JSON array of strings — one string per tweet.',
      'No markdown fences, no commentary, no numbering prefixes.',
      'Each tweet must be under 270 characters.',
      'Tweet 1 must be a strong hook. The last tweet wraps up with a takeaway or CTA.',
      'Write in the same language as the topic given by the user.',
    ].join(' '),
    messages: [{
      role: 'user',
      content: `Topic: ${topic}\nNumber of tweets: ${length}\nStyle: ${TONE_GUIDE[tone]}`,
    }],
  });
  const block = msg.content[0];
  if (block.type !== 'text') throw new Error('Unexpected LLM response type');
  return parseThreadJson(block.text);
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

```bash
npm test
```

Expected: 6 tests PASS (2 receipt + 4 parse).

- [ ] **Step 5: Smoke test thật với API key** (script tạm, không commit)

```bash
cd ~/Desktop/threadpay/frontend
npx tsx -e "
import { generateThread } from './src/lib/generate-thread';
generateThread('vi sao bitcoin can layer 2', 'educational', 5).then(t => console.log(t));
" 2>/dev/null || npx --yes tsx -e "..."
```

Expected: in ra mảng 5 tweet. (Cần `ANTHROPIC_API_KEY` trong env: `export $(grep ANTHROPIC frontend/.env.local)`.)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(frontend): claude thread generation with strict output parsing"
```

---

### Task 10: API route `POST /api/generate` — luồng x402

**Files:**
- Create: `frontend/src/app/api/generate/route.ts`

- [ ] **Step 1: Viết route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  createInvoice, getInvoice, getGeneration, markPaid,
  saveGenerationAndConsume, isExpired,
} from '@/lib/invoices';
import { fetchReceipt } from '@/lib/receipt';
import { generateThread } from '@/lib/generate-thread';
import { CONTRACT, SBTC_CONTRACT, TONES, LENGTHS, type Tone } from '@/lib/config';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  // ── Nhanh 1: chua co proof → bao gia (HTTP 402) ──
  if (!body.invoiceId) {
    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    const tone = body.tone as Tone;
    const length = Number(body.length);
    if (!topic || topic.length > 300) {
      return NextResponse.json({ error: 'topic is required (max 300 chars)' }, { status: 400 });
    }
    if (!TONES.includes(tone) || !LENGTHS.includes(length as 5 | 8 | 12)) {
      return NextResponse.json({ error: 'invalid tone or length' }, { status: 400 });
    }
    const invoice = await createInvoice(topic, tone, length);
    return NextResponse.json({
      invoiceId: invoice.invoice_id,
      priceStx: invoice.price_stx,
      priceSbtc: invoice.price_sbtc,
      contract: CONTRACT,
      sbtcContract: SBTC_CONTRACT,
      expiresAt: invoice.expires_at,
    }, { status: 402 });
  }

  // ── Nhanh 2: co proof → verify receipt on-chain → generate ──
  const invoice = await getInvoice(body.invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
  }
  if (invoice.status === 'consumed') {
    // Da generate roi → tra lai ket qua cu (chong mat ket qua / double request)
    const existing = await getGeneration(invoice.invoice_id);
    if (existing) {
      return NextResponse.json({ thread: existing.thread_content, invoiceId: invoice.invoice_id });
    }
    return NextResponse.json({ error: 'invoice already consumed' }, { status: 409 });
  }
  if (invoice.status === 'pending' && isExpired(invoice)) {
    return NextResponse.json({ error: 'invoice expired, request a new quote' }, { status: 410 });
  }

  const receipt = await fetchReceipt(invoice.invoice_id);
  if (!receipt) {
    return NextResponse.json({ error: 'payment not found on-chain yet' }, { status: 402 });
  }
  const required = receipt.token === 'STX'
    ? BigInt(invoice.price_stx) : BigInt(invoice.price_sbtc);
  if (receipt.amount < required) {
    return NextResponse.json({ error: 'underpaid' }, { status: 402 });
  }
  await markPaid(invoice.invoice_id);

  // LLM loi o day → invoice van o trang thai 'paid', user retry mien phi.
  const thread = await generateThread(
    invoice.topic, invoice.tone as Tone, invoice.length,
  );

  const gen = await saveGenerationAndConsume({
    invoice_id: invoice.invoice_id,
    payer_address: receipt.payer,
    token: receipt.token,
    amount: Number(receipt.amount),
    tx_id: typeof body.txId === 'string' ? body.txId : '',
    thread_content: thread,
  });

  return NextResponse.json({ thread: gen.thread_content, invoiceId: invoice.invoice_id });
}
```

- [ ] **Step 2: Test nhánh báo giá bằng curl**

```bash
cd ~/Desktop/threadpay/frontend && npm run dev &
sleep 5
curl -s -i -X POST localhost:3000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"topic":"vi sao bitcoin can layer 2","tone":"educational","length":5}' | head -20
```

Expected: `HTTP/1.1 402` + JSON có `invoiceId` (64 hex), `priceStx: 100000`, `contract`.

- [ ] **Step 3: Test nhánh proof với invoice chưa trả**

```bash
curl -s -i -X POST localhost:3000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"invoiceId":"<INVOICE_ID_TU_BUOC_TREN>"}' | head -5
```

Expected: `HTTP/1.1 402` + `"payment not found on-chain yet"`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(frontend): x402 generate endpoint with on-chain verification"
```

---

### Task 11: API routes phụ — generation, history, stats

**Files:**
- Create: `frontend/src/app/api/generation/[invoiceId]/route.ts`
- Create: `frontend/src/app/api/history/route.ts`
- Create: `frontend/src/app/api/stats/route.ts`

- [ ] **Step 1: Viết `generation/[invoiceId]/route.ts`** (lấy lại kết quả đã mua)

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getGeneration } from '@/lib/invoices';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await params;
  const gen = await getGeneration(invoiceId);
  if (!gen) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ thread: gen.thread_content, txId: gen.tx_id, token: gen.token });
}
```

- [ ] **Step 2: Viết `history/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address');
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 });
  const { data, error } = await supabase
    .from('generations')
    .select('invoice_id, token, amount, tx_id, thread_content, created_at, invoices(topic)')
    .eq('payer_address', address)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}
```

- [ ] **Step 3: Viết `stats/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase.from('generations').select('token, amount');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const stats = { threads: data.length, stxRevenue: 0, sbtcRevenue: 0 };
  for (const g of data) {
    if (g.token === 'STX') stats.stxRevenue += g.amount;
    else stats.sbtcRevenue += g.amount;
  }
  return NextResponse.json(stats);
}
```

- [ ] **Step 4: Test bằng curl**

```bash
curl -s localhost:3000/api/stats
curl -s "localhost:3000/api/history?address=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"
curl -s -i localhost:3000/api/generation/0000 | head -3
```

Expected: stats `{"threads":0,...}`, history `{"items":[]}`, generation `404`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(frontend): generation recovery, history and stats endpoints"
```

---

### Task 12: Client-side Stacks library (ví, pay, wait tx)

**Files:**
- Create: `frontend/src/lib/stacks.ts`

- [ ] **Step 1: Viết `frontend/src/lib/stacks.ts`**

```ts
'use client';

import { connect, disconnect, getLocalStorage, request } from '@stacks/connect';
import { Cl } from '@stacks/transactions';
import { CONTRACT, SBTC_CONTRACT, HIRO_API } from './config';

export async function connectWallet(): Promise<string> {
  await connect();
  return getAddress() ?? '';
}

export function getAddress(): string | null {
  const data = getLocalStorage();
  return data?.addresses?.stx?.[0]?.address ?? null;
}

export function disconnectWallet() {
  disconnect();
}

export async function payInvoice(opts: {
  token: 'STX' | 'SBTC';
  invoiceId: string; // 64 hex chars
  amount: number;
}): Promise<string> {
  const common = { contract: CONTRACT as `${string}.${string}`, network: 'testnet' as const };
  if (opts.token === 'STX') {
    const res = await request('stx_callContract', {
      ...common,
      functionName: 'pay-stx',
      functionArgs: [Cl.bufferFromHex(opts.invoiceId), Cl.uint(opts.amount)],
    });
    return res.txid;
  }
  const [sbtcAddr, sbtcName] = SBTC_CONTRACT.split('.');
  const res = await request('stx_callContract', {
    ...common,
    functionName: 'pay-sbtc',
    functionArgs: [
      Cl.contractPrincipal(sbtcAddr, sbtcName),
      Cl.bufferFromHex(opts.invoiceId),
      Cl.uint(opts.amount),
    ],
  });
  return res.txid;
}

// Poll Hiro API den khi tx thanh cong/that bai (timeout ~3 phut)
export async function waitForTx(txid: string): Promise<'success' | 'failed'> {
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`${HIRO_API}/extended/v1/tx/${txid}`);
    if (r.ok) {
      const j = await r.json();
      if (j.tx_status === 'success') return 'success';
      if (typeof j.tx_status === 'string' && j.tx_status.startsWith('abort')) return 'failed';
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  return 'failed';
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: không lỗi. (Nếu `request('stx_callContract', ...)` báo lỗi type theo version @stacks/connect, xem signature thật trong `node_modules/@stacks/connect/dist/types/methods.d.ts` và chỉnh cho khớp — giữ nguyên ý: gọi contract với functionArgs là ClarityValue.)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(frontend): wallet connect, payment and tx polling helpers"
```

---

### Task 13: UI components

**Files:**
- Create: `frontend/src/components/ThreadForm.tsx`
- Create: `frontend/src/components/TweetCard.tsx`
- Create: `frontend/src/components/PaymentStatus.tsx`

- [ ] **Step 1: Viết `ThreadForm.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { TONES, LENGTHS, type Tone } from '@/lib/config';

const TONE_LABELS: Record<Tone, string> = {
  educational: '📚 Giáo dục',
  funny: '😂 Hài hước',
  threadboi: '🧵 Thread-boi',
};

export type FormValues = { topic: string; tone: Tone; length: number; token: 'STX' | 'SBTC' };

export function ThreadForm({ onSubmit, disabled }: {
  onSubmit: (v: FormValues) => void;
  disabled: boolean;
}) {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<Tone>('educational');
  const [length, setLength] = useState<number>(8);
  const [token, setToken] = useState<'STX' | 'SBTC'>('STX');

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (topic.trim()) onSubmit({ topic: topic.trim(), tone, length, token });
      }}
    >
      <textarea
        className="rounded-lg border p-3 min-h-24"
        placeholder="Nhập topic hoặc ý tưởng cho thread..."
        maxLength={300}
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
      />
      <div className="flex gap-2 flex-wrap">
        {TONES.map((t) => (
          <button key={t} type="button"
            className={`rounded-full border px-3 py-1 text-sm ${tone === t ? 'bg-black text-white' : ''}`}
            onClick={() => setTone(t)}>
            {TONE_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {LENGTHS.map((l) => (
          <button key={l} type="button"
            className={`rounded-full border px-3 py-1 text-sm ${length === l ? 'bg-black text-white' : ''}`}
            onClick={() => setLength(l)}>
            {l} tweets
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {(['STX', 'SBTC'] as const).map((tk) => (
          <button key={tk} type="button"
            className={`rounded-full border px-3 py-1 text-sm ${token === tk ? 'bg-orange-500 text-white' : ''}`}
            onClick={() => setToken(tk)}>
            Trả bằng {tk === 'SBTC' ? 'sBTC' : 'STX'}
          </button>
        ))}
      </div>
      <button type="submit" disabled={disabled || !topic.trim()}
        className="rounded-lg bg-black text-white py-3 font-semibold disabled:opacity-40">
        ⚡ Generate Thread
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Viết `TweetCard.tsx`**

```tsx
'use client';

import { useState } from 'react';

export function TweetCard({ text, index, total }: {
  text: string; index: number; total: number;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-2">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{index + 1}/{total}</span>
        <span className={text.length > 280 ? 'text-red-500' : ''}>{text.length}/280</span>
      </div>
      <p className="whitespace-pre-wrap">{text}</p>
      <button
        className="self-end text-sm text-blue-600"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}>
        {copied ? '✓ Đã copy' : 'Copy'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Viết `PaymentStatus.tsx`**

```tsx
'use client';

import { HIRO_API } from '@/lib/config';

export type Phase =
  | 'idle' | 'quoting' | 'awaiting-signature'
  | 'confirming' | 'generating' | 'done' | 'error';

const MESSAGES: Record<Phase, string> = {
  idle: '',
  quoting: 'Đang lấy báo giá (HTTP 402)...',
  'awaiting-signature': 'Mở ví để ký thanh toán...',
  confirming: 'Chờ transaction confirm trên Stacks (~10s)...',
  generating: 'Đã thanh toán ✓ — AI đang viết thread...',
  done: '',
  error: 'Có lỗi xảy ra.',
};

export function PaymentStatus({ phase, txid, error }: {
  phase: Phase; txid?: string; error?: string;
}) {
  if (phase === 'idle' || phase === 'done') return null;
  return (
    <div className="rounded-lg border p-4 text-sm flex flex-col gap-1">
      <span>{phase === 'error' ? (error ?? MESSAGES.error) : MESSAGES[phase]}</span>
      {txid && (
        <a className="text-blue-600 underline" target="_blank" rel="noreferrer"
          href={`https://explorer.hiro.so/txid/${txid}?chain=testnet`}>
          Xem transaction trên explorer ↗
        </a>
      )}
      {(phase === 'confirming' || phase === 'generating' || phase === 'quoting') && (
        <div className="h-1 w-full overflow-hidden rounded bg-gray-200">
          <div className="h-full w-1/3 animate-pulse bg-orange-500" />
        </div>
      )}
    </div>
  );
}
```

(`HIRO_API` import giữ cho link explorer đổi theo network nếu cần về sau; nếu lint báo unused, dùng nó để build URL thay vì hardcode.)

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add -A && git commit -m "feat(frontend): thread form, tweet card and payment status components"
```

---

### Task 14: Trang chính — ghép luồng x402 end-to-end

**Files:**
- Modify: `frontend/src/app/page.tsx` (thay toàn bộ nội dung scaffold)

- [ ] **Step 1: Viết `page.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { ThreadForm, type FormValues } from '@/components/ThreadForm';
import { TweetCard } from '@/components/TweetCard';
import { PaymentStatus, type Phase } from '@/components/PaymentStatus';
import { connectWallet, getAddress, payInvoice, waitForTx } from '@/lib/stacks';

type Quote = {
  invoiceId: string; priceStx: number; priceSbtc: number; expiresAt: string;
};

export default function Home() {
  const [address, setAddress] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [txid, setTxid] = useState<string>();
  const [error, setError] = useState<string>();
  const [thread, setThread] = useState<string[]>([]);
  const [stats, setStats] = useState<{ threads: number; stxRevenue: number; sbtcRevenue: number }>();

  useEffect(() => {
    setAddress(getAddress());
    fetch('/api/stats').then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  async function handleGenerate(values: FormValues) {
    setError(undefined); setThread([]); setTxid(undefined);
    try {
      if (!getAddress()) {
        const addr = await connectWallet();
        setAddress(addr);
      }
      // 1) Xin bao gia → expect 402
      setPhase('quoting');
      const quoteRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: values.topic, tone: values.tone, length: values.length }),
      });
      if (quoteRes.status !== 402) throw new Error('Không lấy được báo giá');
      const quote: Quote = await quoteRes.json();

      // 2) Ky contract-call tu vi
      setPhase('awaiting-signature');
      const amount = values.token === 'STX' ? quote.priceStx : quote.priceSbtc;
      const tx = await payInvoice({ token: values.token, invoiceId: quote.invoiceId, amount });
      setTxid(tx);

      // 3) Cho confirm
      setPhase('confirming');
      const status = await waitForTx(tx);
      if (status !== 'success') throw new Error('Transaction thất bại — invoice còn hạn, thử lại được');

      // 4) Retry kem proof → nhan thread
      setPhase('generating');
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: quote.invoiceId, txId: tx }),
      });
      if (!genRes.ok) {
        const e = await genRes.json().catch(() => ({}));
        throw new Error(e.error ?? `Lỗi ${genRes.status}`);
      }
      const data = await genRes.json();
      setThread(data.thread);
      setPhase('done');
      fetch('/api/stats').then((r) => r.json()).then(setStats).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định');
      setPhase('error');
    }
  }

  const busy = !['idle', 'done', 'error'].includes(phase);

  return (
    <main className="mx-auto max-w-xl p-6 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">⚡ ThreadPay</h1>
        <button className="text-sm underline"
          onClick={async () => setAddress(address ? null : await connectWallet())}>
          {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connect ví'}
        </button>
      </header>
      <p className="text-sm text-gray-600">
        AI viết thread cho X — trả từng lần bằng STX hoặc sBTC. Không tài khoản, không subscription.
      </p>

      <ThreadForm onSubmit={handleGenerate} disabled={busy} />
      <PaymentStatus phase={phase} txid={txid} error={error} />

      {thread.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Thread của bạn 🧵</h2>
            <button className="text-sm text-blue-600"
              onClick={() => navigator.clipboard.writeText(thread.join('\n\n'))}>
              Copy cả thread
            </button>
          </div>
          {thread.map((t, i) => (
            <TweetCard key={i} text={t} index={i} total={thread.length} />
          ))}
        </section>
      )}

      {stats && (
        <footer className="text-xs text-gray-500 border-t pt-4">
          🔥 {stats.threads} threads đã bán · {stats.stxRevenue / 1_000_000} STX + {stats.sbtcRevenue} sats doanh thu on-chain
        </footer>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Chạy dev, kiểm tra render**

```bash
npm run dev
```

Mở `localhost:3000`: form hiển thị, nút Connect ví mở Leather/Xverse, bấm Generate khi chưa nhập topic bị disable.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(frontend): main page wiring full x402 flow"
```

---

### Task 15: History panel theo ví

**Files:**
- Create: `frontend/src/components/HistoryPanel.tsx`
- Modify: `frontend/src/app/page.tsx` (thêm panel dưới form)

- [ ] **Step 1: Viết `HistoryPanel.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';

type Item = {
  invoice_id: string;
  token: string;
  amount: number;
  thread_content: string[];
  created_at: string;
  invoices: { topic: string } | null;
};

export function HistoryPanel({ address, onSelect }: {
  address: string | null;
  onSelect: (thread: string[]) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (!address) { setItems([]); return; }
    fetch(`/api/history?address=${address}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => {});
  }, [address]);

  if (!address || items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h2 className="font-semibold text-sm">Threads đã mua</h2>
      {items.map((it) => (
        <button key={it.invoice_id}
          className="text-left text-sm rounded border p-2 hover:bg-gray-50"
          onClick={() => onSelect(it.thread_content)}>
          <span className="font-medium">{it.invoices?.topic ?? '(không rõ topic)'}</span>
          <span className="text-gray-500"> · {it.token} · {new Date(it.created_at).toLocaleString()}</span>
        </button>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Gắn vào `page.tsx`**

Thêm import: `import { HistoryPanel } from '@/components/HistoryPanel';`

Thêm trước `{stats && (` :

```tsx
      <HistoryPanel address={address} onSelect={(t) => { setThread(t); setPhase('done'); }} />
```

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add -A && git commit -m "feat(frontend): purchase history panel by wallet"
```

---

### Task 16: E2E testnet + demo script

**Files:**
- Create: `docs/demo-script.md`

- [ ] **Step 1: E2E nhánh STX với ví thật**

Checklist chạy tay trên `localhost:3000` (ví Leather/Xverse chuyển sang Testnet mode, có STX faucet):

1. Connect ví → địa chỉ hiện trên header.
2. Nhập topic, chọn STX, Generate → trạng thái `quoting → awaiting-signature` → ví mở popup.
3. Ký → `confirming` kèm link explorer → `generating` → thread hiện tweet cards.
4. Refresh trang → vào History panel → bấm lại item vừa mua → thread hiện lại (không mất kết quả).
5. Footer stats tăng +1 thread.

- [ ] **Step 2: E2E nhánh sBTC**

Lấy sBTC testnet (faucet tại platform.hiro.so hoặc app.testnet.sbtc.tech), lặp lại flow với token sBTC. Verify receipt token = SBTC trong tx events trên explorer.

- [ ] **Step 3: Test các nhánh lỗi**

1. Ký xong rồi đóng app khi đang `confirming` → mở lại, gọi `GET /api/generation/<invoiceId>` trả thread nếu đã generate, hoặc retry POST với invoiceId — không mất tiền.
2. Hủy ký trong ví → quay về form, generate lại với invoice mới OK.
3. Gửi 2 request proof song song (curl) cùng invoiceId → cả hai nhận cùng một thread, DB chỉ có 1 row generations.

- [ ] **Step 4: Viết `docs/demo-script.md`** — kịch bản 2 phút từ spec mục 11, kèm: địa chỉ contract testnet, link explorer, 2 topic mẫu đã thử chạy đẹp, screenshot dự phòng nếu mạng testnet chậm.

- [ ] **Step 5: Commit cuối**

```bash
git add -A && git commit -m "docs: demo script and e2e checklist"
```

---

## Self-review notes (đã chạy)

- **Spec coverage:** contract (Task 3-5), x402 backend (Task 10), DB schema + 2 bảng (Task 6), recovery/history/stats endpoints (Task 11), frontend flow + tweet cards + history + stats footer (Task 13-15), error handling map của spec phủ bởi Task 10 (consumed/expired/underpaid/not-found) + Task 16 (E2E các nhánh lỗi), testing 3 tầng (Task 3-4 contract, Task 8-9 unit, Task 16 E2E). Roadmap items: không build — đúng spec.
- **Type consistency:** `Receipt` (receipt.ts) dùng ở Task 10; `Invoice`/`Generation` (invoices.ts) dùng ở Task 10-11; `Phase` (PaymentStatus) dùng ở Task 14; `FormValues` (ThreadForm) dùng ở Task 14. Token string `'STX' | 'SBTC'` thống nhất contract ↔ TS.
- **Điểm rủi ro đã ghi chú inline:** cấu trúc `cvToJSON` theo version (Task 8 Step 4), signature `request()` của @stacks/connect theo version (Task 12 Step 2), địa chỉ sBTC testnet (Task 5 Step 1 có lệnh verify).
