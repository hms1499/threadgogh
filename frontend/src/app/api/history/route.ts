import { NextRequest, NextResponse } from 'next/server';
import { authenticateAddress, applySessionCookie } from '@/lib/request-auth';
import { fetchHistoryPage, type HistoryCursor } from '@/lib/history';

// POST (not GET): a sign-in carries a wallet signature proving the caller controls
// the address. After the first sign-in the server issues an HttpOnly session cookie,
// so paging and remounts no longer re-prompt the wallet.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });

  // A fresh signature always wins over an existing cookie, so switching wallets
  // re-binds the session instead of serving the previous address's history.
  const auth = authenticateAddress(req, body);
  if (!auth.ok) return NextResponse.json({ error: `unauthorized: ${auth.reason}` }, { status: 401 });

  try {
    const { items, nextCursor } = await fetchHistoryPage(auth.address, parseCursor(body.cursor));
    const res = NextResponse.json({ items, nextCursor });
    if (auth.mintCookie) applySessionCookie(res, auth.address);
    return res;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'history read failed' }, { status: 500 });
  }
}

// A cursor is only trusted to be paged back to us; a malformed one falls back to
// the first page rather than erroring (and never widens what the caller can read,
// which is already gated by their session/address).
function parseCursor(raw: unknown): HistoryCursor | null {
  if (!raw || typeof raw !== 'object') return null;
  const { createdAt, id } = raw as Record<string, unknown>;
  if (typeof createdAt !== 'string' || typeof id !== 'number') return null;
  return { createdAt, id };
}
