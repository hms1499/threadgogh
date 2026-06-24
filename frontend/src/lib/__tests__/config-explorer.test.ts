import { describe, it, expect } from 'vitest';
import { explorerTxUrl, STACKS_NETWORK } from '@/lib/config';

describe('explorerTxUrl', () => {
  it('builds a Hiro explorer txid URL for the active network', () => {
    expect(explorerTxUrl('0xabc')).toBe(
      `https://explorer.hiro.so/txid/0xabc?chain=${STACKS_NETWORK}`,
    );
  });
});
