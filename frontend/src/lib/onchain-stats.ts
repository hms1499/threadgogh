import { CONTRACT, HIRO_API } from './config';

// Server-only. Derives stats from the on-chain truth: every successful pay-stx /
// pay-sbtc call to the thread-pay contract is a real, paid thread. This is the
// source of revenue, NOT the Supabase `generations` table — direct payments (e.g.
// x402 agents calling the contract without redeeming through the web app) never
// create a DB row, so a DB-based count under-reports actual on-chain revenue.

export type HiroTxArg = { name: string; repr: string };
export type HiroTx = {
  tx_status: string;
  tx_type: string;
  contract_call?: { function_name: string; function_args?: HiroTxArg[] };
};

export type OnChainStats = { threads: number; stxRevenue: number; sbtcRevenue: number };

const PAY_FUNCTIONS = new Set(['pay-stx', 'pay-sbtc']);

// Clarity uint repr is like "u100000"; strip the leading 'u'. Returns 0 for a
// missing/unparseable amount so a payment still counts as a thread.
function parseUint(repr: string | undefined): number {
  if (!repr) return 0;
  const n = Number(repr.replace(/^u/, ''));
  return Number.isFinite(n) ? n : 0;
}

export function aggregateOnChainStats(txs: HiroTx[]): OnChainStats {
  const stats: OnChainStats = { threads: 0, stxRevenue: 0, sbtcRevenue: 0 };
  for (const tx of txs) {
    if (tx.tx_status !== 'success' || tx.tx_type !== 'contract_call') continue;
    const call = tx.contract_call;
    if (!call || !PAY_FUNCTIONS.has(call.function_name)) continue;
    const amount = parseUint(call.function_args?.find((a) => a.name === 'amount')?.repr);
    stats.threads += 1;
    if (call.function_name === 'pay-stx') stats.stxRevenue += amount;
    else stats.sbtcRevenue += amount;
  }
  return stats;
}

const PAGE = 50;
// Bound the paging so a contract with a huge history can't hang the stats route.
const MAX_PAGES = 60; // up to 3000 txs

// Page through the contract's transaction history on Hiro and aggregate.
export async function fetchOnChainStats(): Promise<OnChainStats> {
  const all: HiroTx[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = `${HIRO_API}/extended/v1/address/${CONTRACT}/transactions?limit=${PAGE}&offset=${offset}`;
    // Cache upstream pages briefly so a burst of page loads doesn't hammer Hiro.
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`Hiro ${res.status} fetching contract transactions`);
    const body = (await res.json()) as { total: number; results: HiroTx[] };
    all.push(...(body.results ?? []));
    offset += PAGE;
    if (offset >= (body.total ?? 0) || (body.results ?? []).length === 0) break;
  }
  return aggregateOnChainStats(all);
}
