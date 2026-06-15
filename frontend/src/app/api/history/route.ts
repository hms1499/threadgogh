import { NextRequest, NextResponse } from 'next/server';
import { verifyHistoryAuth } from '@/lib/auth';
import { fetchHistoryPage, type HistoryCursor } from '@/lib/history';

// POST (not GET): the body carries a wallet signature proving the caller controls
// the address. Without it, anyone could read any address's threads by guessing it.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });

  const auth = verifyHistoryAuth({
    address: body.address, message: body.message, signature: body.signature,
  });
  if (!auth.ok) return NextResponse.json({ error: `unauthorized: ${auth.reason}` }, { status: 401 });

  try {
    const { items, nextCursor } = await fetchHistoryPage(body.address, parseCursor(body.cursor));
    return NextResponse.json({ items, nextCursor });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'history read failed' }, { status: 500 });
  }
}

// A cursor is only trusted to be paged back to us; a malformed one falls back to
// the first page rather than erroring (and never widens what the caller can read,
// which is already gated by their verified address).
function parseCursor(raw: unknown): HistoryCursor | null {
  if (!raw || typeof raw !== 'object') return null;
  const { createdAt, id } = raw as Record<string, unknown>;
  if (typeof createdAt !== 'string' || typeof id !== 'number') return null;
  return { createdAt, id };
}
