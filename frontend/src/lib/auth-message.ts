// Pure, isomorphic — safe to import on both client and server. Keep it free of
// server-only crypto so the client bundle stays clean. The client builds this
// message for the wallet to sign; the server reconstructs it byte-for-byte to
// verify, so the two MUST stay identical.
//
// Domain and network are bound into the message: a signature is only valid for the
// app domain and Stacks network it names, so it can't be replayed against a phishing
// clone or the wrong network.

import type { StacksNetwork } from './config';

export function buildHistoryMessage(
  address: string,
  issuedAt: string,
  domain: string,
  network: StacksNetwork,
): string {
  return [
    'ThreadGogh — sign in to view your thread history.',
    '',
    `Address: ${address}`,
    `Domain: ${domain}`,
    `Network: ${network}`,
    `Issued: ${issuedAt}`,
    '',
    'This is a free signature — it does not move funds or create a transaction.',
  ].join('\n');
}
