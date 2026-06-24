import { NextRequest, NextResponse } from 'next/server';
import { getGeneration } from '@/lib/invoices';
import { mintShareSlug, clearShareSlug } from '@/lib/share';
import { authenticateAddress, applySessionCookie } from '@/lib/request-auth';

// invoice ids are 32 random bytes, hex (64 chars).
const INVOICE_RE = /^[0-9a-f]{64}$/;

// Resolve { invoiceId, auth } and the owning generation, enforcing that the
// signer is the on-chain payer. Shared by POST (mint) and DELETE (revoke).
async function authorizeOwner(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const invoiceId = body && typeof body.invoiceId === 'string' ? body.invoiceId : '';
  if (!INVOICE_RE.test(invoiceId)) {
    return { error: NextResponse.json({ error: 'invoiceId is required' }, { status: 400 }) };
  }
  const auth = authenticateAddress(req, body);
  if (!auth.ok) {
    return { error: NextResponse.json({ error: `unauthorized: ${auth.reason}` }, { status: 401 }) };
  }
  const generation = await getGeneration(invoiceId);
  if (!generation) {
    return { error: NextResponse.json({ error: 'nothing to share' }, { status: 404 }) };
  }
  // The on-chain payer owns the thread — client input alone can never authorize.
  if (generation.payer_address !== auth.address) {
    return { error: NextResponse.json({ error: 'not your thread' }, { status: 403 }) };
  }
  return { invoiceId, generation, auth };
}

export async function POST(req: NextRequest) {
  try {
    const r = await authorizeOwner(req);
    if (r.error) return r.error;
    // Idempotent: an already-public thread returns its existing slug.
    const slug = r.generation.share_slug ?? (await mintShareSlug(r.invoiceId));
    const res = NextResponse.json({ slug });
    if (r.auth.mintCookie) applySessionCookie(res, r.auth.address);
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'share failed' }, { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const r = await authorizeOwner(req);
    if (r.error) return r.error;
    await clearShareSlug(r.invoiceId);
    const res = NextResponse.json({ ok: true });
    if (r.auth.mintCookie) applySessionCookie(res, r.auth.address);
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unshare failed' }, { status: 500 },
    );
  }
}
