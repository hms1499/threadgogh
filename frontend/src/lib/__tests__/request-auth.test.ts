import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAddressFromPrivateKey, signMessageHashRsv } from '@stacks/transactions';
import { authenticateAddress, applySessionCookie } from '@/lib/request-auth';
import { hashMessage } from '@/lib/auth';
import { buildHistoryMessage } from '@/lib/auth-message';
import { APP_DOMAIN, STACKS_NETWORK } from '@/lib/config';
import { createSessionToken, SESSION_COOKIE } from '@/lib/session';

const PRIVATE_KEY = 'edf9aee84d9b7abc145504dde6726c64f369d37ee34ed1deb56e89e8a456789a01';
const ADDRESS = getAddressFromPrivateKey(PRIVATE_KEY, 'testnet');

function signedBody(address = ADDRESS) {
  const message = buildHistoryMessage(address, new Date().toISOString(), APP_DOMAIN, STACKS_NETWORK);
  const signature = signMessageHashRsv({ messageHash: hashMessage(message), privateKey: PRIVATE_KEY });
  return { address, message, signature };
}

function req(cookie?: string) {
  return { cookies: { get: (n: string) => (n === SESSION_COOKIE && cookie ? { value: cookie } : undefined) } };
}

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = 'test-secret-at-least-32-bytes-long-xxxxxx';
});

describe('authenticateAddress', () => {
  it('resolves an address from a valid session cookie, no cookie mint', () => {
    const token = createSessionToken(ADDRESS);
    expect(authenticateAddress(req(token), {})).toEqual({
      ok: true, address: ADDRESS, mintCookie: false,
    });
  });

  it('resolves an address from a fresh valid signature and flags a cookie mint', () => {
    expect(authenticateAddress(req(), signedBody())).toEqual({
      ok: true, address: ADDRESS, mintCookie: true,
    });
  });

  it('rejects when neither a signature nor a valid session is present', () => {
    expect(authenticateAddress(req(), {})).toEqual({ ok: false, reason: 'sign in required' });
  });

  it('rejects an invalid signature (not ok)', () => {
    const bad = { ...signedBody(), signature: '00'.repeat(65) };
    const r = authenticateAddress(req(), bad);
    expect(r.ok).toBe(false);
  });

  it('a fresh signature takes precedence over an existing cookie (wallet switch)', () => {
    const otherToken = createSessionToken('ST1OLDADDRESS00000000000000000000000000000');
    expect(authenticateAddress(req(otherToken), signedBody())).toEqual({
      ok: true, address: ADDRESS, mintCookie: true,
    });
  });
});

describe('applySessionCookie', () => {
  it('sets the session cookie with a freshly minted token', () => {
    const set = vi.fn();
    applySessionCookie({ cookies: { set } }, ADDRESS);
    expect(set).toHaveBeenCalledTimes(1);
    const [name, value] = set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(0);
  });
});
