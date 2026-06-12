import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase.from('generations').select('token, amount');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const stats = { threads: data.length, stxRevenue: 0, sbtcRevenue: 0 };
  for (const g of data) {
    if (g.token === 'STX') stats.stxRevenue += g.amount;
    else stats.sbtcRevenue += g.amount;
  }
  return NextResponse.json(stats);
}
