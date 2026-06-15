import { describe, it, expect, beforeEach } from 'vitest';
import { createSessionToken, verifySessionToken, SESSION_TTL_MS } from '@/lib/session';

const ADDR = 'ST1PAYER000000000000000000000000000000000';

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = 'test-secret-at-least-32-bytes-long-xxxxxx';
});

describe('session token round-trip', () => {
  it('verifies a freshly created token back to its address', () => {
    const token = createSessionToken(ADDR);
    expect(verifySessionToken(token)).toEqual({ address: ADDR });
  });
});

describe('verifySessionToken rejects', () => {
  it('a missing/empty token', () => {
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('no-dot-here')).toBeNull();
  });

  it('a tampered signature', () => {
    const token = createSessionToken(ADDR);
    const [payload] = token.split('.');
    expect(verifySessionToken(`${payload}.deadbeef`)).toBeNull();
  });

  it('a tampered payload (mac no longer matches)', () => {
    const token = createSessionToken(ADDR);
    const [, mac] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ address: 'ST1ATTACKER', exp: Date.now() + 1e9 })).toString('base64url');
    expect(verifySessionToken(`${forged}.${mac}`)).toBeNull();
  });

  it('a token signed under a different secret', () => {
    const token = createSessionToken(ADDR);
    process.env.AUTH_SESSION_SECRET = 'a-totally-different-secret-32-bytes-yyyyyy';
    expect(verifySessionToken(token)).toBeNull();
  });

  it('an expired token', () => {
    const issuedAt = 1_000_000;
    const token = createSessionToken(ADDR, issuedAt);
    expect(verifySessionToken(token, issuedAt + SESSION_TTL_MS + 1)).toBeNull();
    // still valid just before expiry
    expect(verifySessionToken(token, issuedAt + SESSION_TTL_MS - 1)).toEqual({ address: ADDR });
  });
});
