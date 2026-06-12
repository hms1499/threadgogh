import { describe, expect, it } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

const invoiceA = new Uint8Array(32).fill(1);
const invoiceB = new Uint8Array(32).fill(2);

describe('pay-stx', () => {
  it('records a receipt when paying at least the minimum price', () => {
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

  it('rejects underpayment (ERR-UNDERPAID u100)', () => {
    const res = simnet.callPublicFn(
      'thread-pay', 'pay-stx',
      [Cl.buffer(invoiceA), Cl.uint(99999)], wallet1,
    );
    expect(res.result).toBeErr(Cl.uint(100));
  });

  it('rejects a duplicate invoice-id (ERR-DUPLICATE-INVOICE u101)', () => {
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

  it('get-receipt returns none for an unpaid invoice', () => {
    const receipt = simnet.callReadOnlyFn(
      'thread-pay', 'get-receipt',
      [Cl.buffer(new Uint8Array(32).fill(9))], wallet1,
    );
    expect(receipt.result).toBeNone();
  });
});

describe('pay-sbtc', () => {
  const invoiceC = new Uint8Array(32).fill(3);

  function setupMockSbtc() {
    // owner points sbtc-contract at the mock, mints to wallet1
    simnet.callPublicFn('thread-pay', 'set-sbtc-contract',
      [Cl.contractPrincipal(deployer, 'mock-sbtc')], deployer);
    simnet.callPublicFn('mock-sbtc', 'mint',
      [Cl.uint(10000), Cl.principal(wallet1)], deployer);
  }

  it('records an SBTC receipt when paying via the mock token', () => {
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

  it('rejects a foreign token contract (ERR-WRONG-TOKEN u103)', () => {
    // sbtc-contract is set to the mock by setupMockSbtc, then repointed elsewhere —
    // calling pay-sbtc with the mock token no longer matches and gets rejected
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
  it('set-prices is owner-only (ERR-NOT-OWNER u102)', () => {
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
