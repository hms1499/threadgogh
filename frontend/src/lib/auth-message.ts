// Pure, isomorphic — safe to import on both client and server. Keep it free of
// server-only crypto so the client bundle stays clean. The client builds this
// message for the wallet to sign; the server reconstructs it byte-for-byte to
// verify, so the two MUST stay identical.

export function buildHistoryMessage(address: string, issuedAt: string): string {
  return [
    'ThreadGogh — sign in to view your thread history.',
    '',
    `Address: ${address}`,
    `Issued: ${issuedAt}`,
    '',
    'This is a free signature — it does not move funds or create a transaction.',
  ].join('\n');
}
