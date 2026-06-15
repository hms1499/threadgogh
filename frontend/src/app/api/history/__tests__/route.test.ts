import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ verifyHistoryAuth: vi.fn() }));
vi.mock('@/lib/history', () => ({ fetchHistoryPage: vi.fn() }));
vi.mock('@/lib/session', () => ({
  SESSION_COOKIE: 'tg_session',
  verifySessionToken: vi.fn(),
  createSessionToken: vi.fn(() => 'NEW_SESSION_TOKEN'),
  sessionCookieOptions: () => ({ httpOnly: true, path: '/' }),
}));

import { POST } from '../route';
import { verifyHistoryAuth } from '@/lib/auth';
import { fetchHistoryPage } from '@/lib/history';
import { verifySessionToken } from '@/lib/session';

const m = vi.mocked;

// Fake NextRequest: the route calls req.json() and req.cookies.get(name)?.value.
function req(body: unknown, cookie?: string) {
  return {
    json: async () => body,
    cookies: { get: (n: string) => (n === 'tg_session' && cookie ? { value: cookie } : undefined) },
  } as unknown as Parameters<typeof POST>[0];
}

const SIG = { address: 'ST1PAYER', message: 'msg', signature: 'sig' };
const PAGE = { items: [{ topic: 'x' }], nextCursor: null };

beforeEach(() => {
  vi.clearAllMocks();
  m(fetchHistoryPage).mockResolvedValue(PAGE as never);
  m(verifyHistoryAuth).mockReturnValue({ ok: true });
  m(verifySessionToken).mockReturnValue(null);
});

describe('POST /api/history — auth', () => {
  it('400 on invalid JSON body', async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(400);
  });

  it('valid session cookie + no signature -> skips signature, no Set-Cookie', async () => {
    m(verifySessionToken).mockReturnValue({ address: 'ST1FROMCOOKIE' });
    const res = await POST(req({ cursor: null }, 'good-cookie'));
    expect(res.status).toBe(200);
    expect(verifyHistoryAuth).not.toHaveBeenCalled();
    expect(fetchHistoryPage).toHaveBeenCalledWith('ST1FROMCOOKIE', null);
    expect(res.cookies.get('tg_session')).toBeUndefined();
  });

  it('no cookie + valid signature -> 200 and sets a session cookie', async () => {
    const res = await POST(req({ ...SIG }));
    expect(res.status).toBe(200);
    expect(fetchHistoryPage).toHaveBeenCalledWith('ST1PAYER', null);
    expect(res.cookies.get('tg_session')?.value).toBe('NEW_SESSION_TOKEN');
  });

  it('no cookie + no signature -> 401', async () => {
    const res = await POST(req({ cursor: null }));
    expect(res.status).toBe(401);
    expect(fetchHistoryPage).not.toHaveBeenCalled();
  });

  it('invalid signature -> 401', async () => {
    m(verifyHistoryAuth).mockReturnValue({ ok: false, reason: 'bad' });
    const res = await POST(req({ ...SIG }));
    expect(res.status).toBe(401);
  });

  it('a fresh signature overrides an existing cookie (wallet switch)', async () => {
    // cookie says address A, but the body carries a signature for address B
    m(verifySessionToken).mockReturnValue({ address: 'ST1OLD' });
    const res = await POST(req({ ...SIG, address: 'ST1NEW' }, 'old-cookie'));
    expect(res.status).toBe(200);
    expect(verifyHistoryAuth).toHaveBeenCalled();
    expect(fetchHistoryPage).toHaveBeenCalledWith('ST1NEW', null);
    expect(res.cookies.get('tg_session')?.value).toBe('NEW_SESSION_TOKEN');
  });

  it('passes a provided cursor through', async () => {
    m(verifySessionToken).mockReturnValue({ address: 'ST1FROMCOOKIE' });
    const cursor = { createdAt: '2026-06-15T10:00:00.000+00:00', id: 9 };
    await POST(req({ cursor }, 'good-cookie'));
    expect(fetchHistoryPage).toHaveBeenCalledWith('ST1FROMCOOKIE', cursor);
  });

  it('500 when the DB read fails', async () => {
    m(verifySessionToken).mockReturnValue({ address: 'ST1FROMCOOKIE' });
    m(fetchHistoryPage).mockRejectedValue(new Error('boom'));
    const res = await POST(req({ cursor: null }, 'good-cookie'));
    expect(res.status).toBe(500);
  });
});
