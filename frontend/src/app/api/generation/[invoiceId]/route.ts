import { NextRequest, NextResponse } from 'next/server';
import { getGeneration } from '@/lib/invoices';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await params;
  const gen = await getGeneration(invoiceId);
  if (!gen) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ thread: gen.thread_content, txId: gen.tx_id, token: gen.token });
}
