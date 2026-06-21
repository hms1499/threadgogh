import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, getGeneration, regenerateGeneration } from '@/lib/invoices';
import { getService } from '@/lib/services/registry';
import { applyEdit } from '@/lib/editThread';
import { assertServerEnv } from '@/lib/env';
import { authenticateAddress, applySessionCookie } from '@/lib/request-auth';
import { log } from '@/lib/log';
import { MAX_FREE_REGENS, LENGTHS } from '@/lib/config';

// Upper bound on a client-supplied base thread for a per-tweet re-roll — the
// longest a thread can be (max LENGTHS). Guards against an oversized payload.
const MAX_THREAD = Math.max(...LENGTHS);

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

  // A re-roll overwrites a paid thread and burns a free re-roll, so it must be gated by
  // ownership, not the invoiceId alone. Authenticate the caller to an address (shared
  // with /api/history), then check it against the thread's on-chain payer below.
  const auth = authenticateAddress(req, body);
  if (!auth.ok) return NextResponse.json({ error: `unauthorized: ${auth.reason}` }, { status: 401 });

  try {
    // Two independent reads on the same key — fetch them together rather than serially.
    const [invoice, generation] = await Promise.all([
      getInvoice(invoiceId),
      getGeneration(invoiceId),
    ]);
    // A re-roll only makes sense once a thread has been paid for and produced.
    if (!invoice || !generation) {
      return NextResponse.json({ error: 'nothing to regenerate' }, { status: 404 });
    }
    // Ownership: only the on-chain payer of this thread may re-roll it. payer_address
    // is captured from the verified receipt at generation time, so it's trustworthy.
    if (generation.payer_address !== auth.address) {
      return NextResponse.json({ error: 'forbidden: not your thread' }, { status: 403 });
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

    // A per-tweet re-roll (tweetIndex present) rewrites just one tweet against the
    // client's current thread; otherwise the whole thread is regenerated from the
    // topic. Both burn one free re-roll and persist via the same CAS below.
    const perTweet = Number.isInteger(body.tweetIndex);

    // Generate BEFORE touching the counter: if the LLM fails the user keeps their
    // remaining free re-rolls and the existing thread stays intact.
    let thread: string[];
    if (perTweet) {
      const baseRaw: unknown = body.thread;
      const index = body.tweetIndex as number;
      if (!Array.isArray(baseRaw) || baseRaw.length === 0 || baseRaw.length > MAX_THREAD
          || !baseRaw.every((t) => typeof t === 'string')) {
        return NextResponse.json({ error: 'thread is required for a per-tweet re-roll' }, { status: 400 });
      }
      const base = baseRaw as string[];
      if (index < 0 || index >= base.length) {
        return NextResponse.json({ error: 'tweetIndex out of range' }, { status: 400 });
      }
      let replacement: string;
      try {
        const def = getService(invoice.service_id);
        replacement = await def.regenerateOne(invoice.params ?? {}, base, index);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'generation failed';
        return NextResponse.json({ error: `re-roll failed: ${message}` }, { status: 500 });
      }
      // Cap each base tweet at 280 (the client may send long inline edits) before swap.
      const capped = base.map((t) => (t.length > 280 ? `${t.slice(0, 277)}...` : t));
      thread = applyEdit(capped, index, replacement);
    } else {
      try {
        const def = getService(invoice.service_id);
        thread = await def.generate(invoice.params ?? {}, { previewHook: null });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'generation failed';
        return NextResponse.json({ error: `re-roll failed: ${message}` }, { status: 500 });
      }
    }

    // Compare-and-swap on the count we read: a concurrent re-roll that already bumped
    // it makes this return null -> tell the client to retry; never double-count.
    const updated = await regenerateGeneration(invoiceId, thread, used);
    if (!updated) {
      return NextResponse.json({ error: 'another re-roll is in progress, retry' }, { status: 202 });
    }

    const res = NextResponse.json({
      thread: updated.thread_content,
      regenRemaining: Math.max(0, MAX_FREE_REGENS - (updated.regen_count ?? (used + 1))),
    });
    // First re-roll authenticated by signature → issue a session cookie so further
    // re-rolls (and history) don't re-prompt the wallet, mirroring /api/history.
    if (auth.mintCookie) applySessionCookie(res, auth.address);
    return res;
  } catch (e) {
    log.error('regenerate.unhandled_error', { invoiceId, err: e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'internal server error' },
      { status: 500 },
    );
  }
}
