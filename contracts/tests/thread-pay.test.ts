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
