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
});
