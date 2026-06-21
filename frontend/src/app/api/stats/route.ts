import { NextResponse } from 'next/server';
import { fetchOnChainStats } from '@/lib/onchain-stats';

// Stats reflect the on-chain truth (every paid pay-stx/pay-sbtc on the thread-pay
// contract), not the Supabase `generations` table — direct/agent payments that never
// redeem through the web app still count as real, paid revenue.
export async function GET() {
  try {
    const stats = await fetchOnChainStats();
    return NextResponse.json(stats);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to read on-chain stats' },
      { status: 500 },
    );
  }
}
