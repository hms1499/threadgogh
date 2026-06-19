import { describe, expect, it } from 'vitest';
import { Cl } from '@stacks/transactions';
import { parseReceipt } from '../receipt';

const ADDR = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';

describe('parseReceipt', () => {
  it('parses some(tuple) into a Receipt', () => {
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

  it('returns null for none', () => {
    expect(parseReceipt(Cl.none())).toBeNull();
  });

  // A present-but-malformed receipt must NOT collapse to null: null means "unpaid",
  // and a paid user would then be stuck at 402 forever. It throws a clear error instead.
  it('throws (not null) when a tuple field is missing', () => {
    const cv = Cl.some(Cl.tuple({
      // payer omitted
      amount: Cl.uint(100000),
      token: Cl.stringAscii('STX'),
      'paid-at': Cl.uint(123),
    }));
    expect(() => parseReceipt(cv)).toThrow(/malformed receipt/);
  });

  it('throws on an unexpected token value', () => {
    const cv = Cl.some(Cl.tuple({
      payer: Cl.standardPrincipal(ADDR),
      amount: Cl.uint(100000),
      token: Cl.stringAscii('XYZ'),
      'paid-at': Cl.uint(123),
    }));
    expect(() => parseReceipt(cv)).toThrow(/malformed receipt/);
  });

  it('throws when the optional wraps a non-tuple value', () => {
    expect(() => parseReceipt(Cl.some(Cl.uint(5)))).toThrow(/malformed receipt/);
  });
});
