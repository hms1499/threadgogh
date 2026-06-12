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
