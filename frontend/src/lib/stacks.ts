'use client';

import { connect, disconnect, getLocalStorage, request } from '@stacks/connect';
import { Cl, Pc } from '@stacks/transactions';
import { CONTRACT, SBTC_CONTRACT, HIRO_API } from './config';

export async function connectWallet(): Promise<string> {
  await connect();
  return getAddress() ?? '';
}

export function getAddress(): string | null {
  const data = getLocalStorage();
  return data?.addresses?.stx?.[0]?.address ?? null;
}

export function disconnectWallet() {
  disconnect();
}

export async function payInvoice(opts: {
  token: 'STX' | 'SBTC';
  invoiceId: string; // 64 hex chars
  amount: number;
}): Promise<string> {
  // Ai dang ky = nguoi tra tien (tx-sender). Post-condition phai khoa dung
  // so tien token nay roi khoi vi, neu khong vi se reject (deny mode).
  const sender = getAddress();
  if (!sender) throw new Error('Wallet not connected');

  const common = {
    contract: CONTRACT as `${string}.${string}`,
    network: 'testnet' as const,
    postConditionMode: 'deny' as const,
  };
  if (opts.token === 'STX') {
    const res = await request('stx_callContract', {
      ...common,
      functionName: 'pay-stx',
      functionArgs: [Cl.bufferFromHex(opts.invoiceId), Cl.uint(opts.amount)],
      postConditions: [Pc.principal(sender).willSendEq(opts.amount).ustx()],
    });
    if (!res.txid) throw new Error('Wallet did not return a transaction id');
    return res.txid;
  }
  const [sbtcAddr, sbtcName] = SBTC_CONTRACT.split('.');
  const res = await request('stx_callContract', {
    ...common,
    functionName: 'pay-sbtc',
    functionArgs: [
      Cl.contractPrincipal(sbtcAddr, sbtcName),
      Cl.bufferFromHex(opts.invoiceId),
      Cl.uint(opts.amount),
    ],
    postConditions: [
      Pc.principal(sender).willSendEq(opts.amount).ft(
        SBTC_CONTRACT as `${string}.${string}`, 'sbtc-token',
      ),
    ],
  });
  if (!res.txid) throw new Error('Wallet did not return a transaction id');
  return res.txid;
}

// Poll Hiro API for tx outcome. Three states, because "not confirmed yet" is NOT
// the same as "failed": on a slow block we must not tell the user their payment
// failed (they'd think funds were lost). 'pending' = timed out, still unconfirmed —
// the caller should offer a recovery/"check again" path, not an error.
export async function waitForTx(txid: string): Promise<'success' | 'failed' | 'pending'> {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${HIRO_API}/extended/v1/tx/${txid}`);
    if (r.ok) {
      const j = await r.json();
      if (j.tx_status === 'success') return 'success';
      // Anchored-but-reverted (abort_by_response / abort_by_post_condition) = real failure.
      if (typeof j.tx_status === 'string' && j.tx_status.startsWith('abort')) return 'failed';
    }
    await new Promise((res) => setTimeout(res, 4000));
  }
  return 'pending';
}
