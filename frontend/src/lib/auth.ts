import { createHash } from 'crypto';
import { publicKeyFromSignatureRsv, getAddressFromPublicKey } from '@stacks/transactions';
import { STACKS_NETWORK } from './config';
import { buildHistoryMessage } from './auth-message';

// Server-only. Verifies a Stacks wallet signature proving the requester controls
// the address whose history they're asking for (sign-in-with-Stacks).

// Stacks plain-message hash, matching what wallets sign for `stx_signMessage`:
//   sha256( <0x17> "Stacks Signed Message:\n" || varint(len) || utf8(message) )
const CHAIN_PREFIX = Buffer.from('\x17Stacks Signed Message:\n', 'utf8');

function varint(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) return Buffer.from([0xfd, n & 0xff, (n >> 8) & 0xff]);
  if (n <= 0xffffffff) {
    return Buffer.from([0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
  }
  throw new Error('message too long');
}

export function hashMessage(message: string): string {
  const m = Buffer.from(message, 'utf8');
  return createHash('sha256')
    .update(Buffer.concat([CHAIN_PREFIX, varint(m.length), m]))
    .digest('hex');
}

// How long a signed sign-in stays valid (limits replay if a request is captured).
const WINDOW_MS = 5 * 60_000;
const CLOCK_SKEW_MS = 60_000;

export type HistoryAuth = { address: string; message: string; signature: string };
export type AuthResult = { ok: true } | { ok: false; reason: string };

export function verifyHistoryAuth({ address, message, signature }: HistoryAuth): AuthResult {
  if (!address || !message || !signature) return { ok: false, reason: 'missing fields' };

  const issued = message.match(/^Issued: (.+)$/m);
  if (!issued) return { ok: false, reason: 'malformed message' };
  const issuedAt = Date.parse(issued[1]);
  if (Number.isNaN(issuedAt)) return { ok: false, reason: 'bad timestamp' };

  const now = Date.now();
  if (issuedAt > now + CLOCK_SKEW_MS) return { ok: false, reason: 'timestamp in the future' };
  if (issuedAt < now - WINDOW_MS) return { ok: false, reason: 'signature expired' };

  // Reconstruct the exact expected message: rejects any altered/extra content and
  // binds the signature to this address.
  if (message !== buildHistoryMessage(address, issued[1])) {
    return { ok: false, reason: 'message does not match expected template' };
  }

  // Recover the signer's public key from the signature, derive its address, and
  // require it to equal the claimed address.
  let signer: string;
  try {
    signer = getAddressFromPublicKey(
      publicKeyFromSignatureRsv(hashMessage(message), signature),
      STACKS_NETWORK,
    );
  } catch {
    return { ok: false, reason: 'invalid signature' };
  }
  if (signer !== address) return { ok: false, reason: 'signature does not match address' };

  return { ok: true };
}
