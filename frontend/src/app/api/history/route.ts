import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyHistoryAuth } from '@/lib/auth';

// POST (not GET): the body carries a wallet signature proving the caller controls
// the address. Without it, anyone could read any address's threads by guessing it.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });

  const auth = verifyHistoryAuth({
    address: body.address, message: body.message, signature: body.signature,
  });
  if (!auth.ok) return NextResponse.json({ error: `unauthorized: ${auth.reason}` }, { status: 401 });

  const { data, error } = await supabase
    .from('generations')
    .select('invoice_id, token, amount, tx_id, thread_content, created_at, invoices(topic)')
    .eq('payer_address', body.address)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}
