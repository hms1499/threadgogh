import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, getGeneration, regenerateGeneration } from '@/lib/invoices';
import { generateThread } from '@/lib/generate-thread';
import { assertServerEnv } from '@/lib/env';
import { MAX_FREE_REGENS, type Tone } from '@/lib/config';

export async function POST(req: NextRequest) {
  try {
    assertServerEnv();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'server misconfigured' },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => null);
  const invoiceId = body && typeof body.invoiceId === 'string' ? body.invoiceId : '';
  // invoice ids are 32 random bytes, hex (64 chars) — reject junk before any DB read.
  if (!/^[0-9a-f]{64}$/.test(invoiceId)) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
  }

  try {
    const invoice = await getInvoice(invoiceId);
    const generation = await getGeneration(invoiceId);
    // A re-roll only makes sense once a thread has been paid for and produced.
    if (!invoice || !generation) {
      return NextResponse.json({ error: 'nothing to regenerate' }, { status: 404 });
    }
    if (invoice.status !== 'consumed') {
      return NextResponse.json({ error: 'invoice not consumed yet' }, { status: 409 });
    }

    const used = generation.regen_count ?? 0;
    if (used >= MAX_FREE_REGENS) {
      return NextResponse.json(
        { error: 'free re-roll limit reached', regenRemaining: 0 },
        { status: 429 },
      );
    }

    // Generate BEFORE touching the counter: if the LLM fails the user keeps their
    // remaining free re-rolls and the existing thread stays intact.
    let thread: string[];
    try {
      thread = await generateThread(invoice.topic, invoice.tone as Tone, invoice.length);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'generation failed';
      return NextResponse.json({ error: `re-roll failed: ${message}` }, { status: 500 });
    }

    // Compare-and-swap on the count we read: a concurrent re-roll that already bumped
    // it makes this return null -> tell the client to retry; never double-count.
    const updated = await regenerateGeneration(invoiceId, thread, used);
    if (!updated) {
      return NextResponse.json({ error: 'another re-roll is in progress, retry' }, { status: 202 });
    }

    return NextResponse.json({
      thread: updated.thread_content,
      regenRemaining: Math.max(0, MAX_FREE_REGENS - (updated.regen_count ?? (used + 1))),
    });
  } catch (e) {
    console.error('[regenerate] unhandled error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'internal server error' },
      { status: 500 },
    );
  }
}
