import { describe, expect, it } from 'vitest';
import {
  getAddressFromPrivateKey, getAddressFromPublicKey, privateKeyToPublic,
  signMessageHashRsv,
} from '@stacks/transactions';
import { hashMessage, verifyHistoryAuth } from '../auth';
import { buildHistoryMessage } from '../auth-message';

// Tests run with NEXT_PUBLIC_STACKS_NETWORK=testnet (default in config).
// Compressed key (33 bytes / trailing 01) → compressed pubkey, like real wallets.
const PRIVATE_KEY = 'edf9aee84d9b7abc145504dde6726c64f369d37ee34ed1deb56e89e8a456789a01';
const ADDRESS = getAddressFromPrivateKey(PRIVATE_KEY, 'testnet');

function sign(message: string): string {
  return signMessageHashRsv({ messageHash: hashMessage(message), privateKey: PRIVATE_KEY });
}

describe('verifyHistoryAuth', () => {
  it('accepts a fresh, correctly-signed message from the address', () => {
    const message = buildHistoryMessage(ADDRESS, new Date().toISOString());
    expect(verifyHistoryAuth({ address: ADDRESS, message, signature: sign(message) }))
      .toEqual({ ok: true });
  });

  it('recovered address matches the signing key (recovery sanity)', () => {
    const pub = privateKeyToPublic(PRIVATE_KEY);
    expect(getAddressFromPublicKey(pub, 'testnet')).toBe(ADDRESS);
  });

  it('rejects a signature from a different address', () => {
    const message = buildHistoryMessage(ADDRESS, new Date().toISOString());
    const other = 'a'.repeat(64) + '01';
    const badSig = signMessageHashRsv({ messageHash: hashMessage(message), privateKey: other });
    const r = verifyHistoryAuth({ address: ADDRESS, message, signature: badSig });
    expect(r.ok).toBe(false);
  });

  it('rejects an expired timestamp', () => {
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    const message = buildHistoryMessage(ADDRESS, old);
    const r = verifyHistoryAuth({ address: ADDRESS, message, signature: sign(message) });
    expect(r).toEqual({ ok: false, reason: 'signature expired' });
  });

  it('rejects a tampered message (claimed address != message address)', () => {
    const message = buildHistoryMessage('ST000TAMPERED', new Date().toISOString());
    const r = verifyHistoryAuth({ address: ADDRESS, message, signature: sign(message) });
    expect(r.ok).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(verifyHistoryAuth({ address: '', message: '', signature: '' }).ok).toBe(false);
  });
});
