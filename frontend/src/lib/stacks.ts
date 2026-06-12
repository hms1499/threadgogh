'use client';

import { connect, disconnect, getLocalStorage, request } from '@stacks/connect';
import { Cl } from '@stacks/transactions';
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
  const common = { contract: CONTRACT as `${string}.${string}`, network: 'testnet' as const };
  if (opts.token === 'STX') {
    const res = await request('stx_callContract', {
      ...common,
      functionName: 'pay-stx',
      functionArgs: [Cl.bufferFromHex(opts.invoiceId), Cl.uint(opts.amount)],
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
  });
  if (!res.txid) throw new Error('Wallet did not return a transaction id');
  return res.txid;
}

// Poll Hiro API den khi tx thanh cong/that bai (timeout ~3 phut)
export async function waitForTx(txid: string): Promise<'success' | 'failed'> {
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`${HIRO_API}/extended/v1/tx/${txid}`);
    if (r.ok) {
      const j = await r.json();
      if (j.tx_status === 'success') return 'success';
      if (typeof j.tx_status === 'string' && j.tx_status.startsWith('abort')) return 'failed';
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  return 'failed';
}
