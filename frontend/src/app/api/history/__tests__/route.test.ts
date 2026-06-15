import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ verifyHistoryAuth: vi.fn() }));
vi.mock('@/lib/history', () => ({ fetchHistoryPage: vi.fn() }));

import { POST } from '../route';
import { verifyHistoryAuth } from '@/lib/auth';
import { fetchHistoryPage } from '@/lib/history';

const m = vi.mocked;

// Fake NextRequest: the route only calls req.json().
function req(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

const AUTH = { address: 'ST1PAYER', message: 'msg', signature: 'sig' };
const PAGE = {
  items: [{ invoice_id: 'a', token: 'STX', amount: 1, tx_id: 't', thread_content: ['x'], created_at: 'now', topic: 'bitcoin' }],
  nextCursor: { createdAt: 'now', id: 5 },
};

beforeEach(() => {
  vi.clearAllMocks();
  m(verifyHistoryAuth).mockReturnValue({ ok: true });
  m(fetchHistoryPage).mockResolvedValue(PAGE as never);
});

describe('POST /api/history', () => {
  it('400 on invalid JSON body', async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(400);
    expect(fetchHistoryPage).not.toHaveBeenCalled();
  });

  it('401 when the signature does not verify', async () => {
    m(verifyHistoryAuth).mockReturnValue({ ok: false, reason: 'signature expired' });
    const res = await POST(req({ ...AUTH }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain('signature expired');
    expect(fetchHistoryPage).not.toHaveBeenCalled();
  });

  it('200 with items + nextCursor; first page passes a null cursor', async () => {
    const res = await POST(req({ ...AUTH }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toEqual(PAGE.items);
    expect(json.nextCursor).toEqual(PAGE.nextCursor);
    expect(fetchHistoryPage).toHaveBeenCalledWith('ST1PAYER', null);
  });

  it('passes a provided cursor through to fetchHistoryPage', async () => {
    const cursor = { createdAt: '2026-06-15T10:00:00.000+00:00', id: 9 };
    await POST(req({ ...AUTH, cursor }));
    expect(fetchHistoryPage).toHaveBeenCalledWith('ST1PAYER', cursor);
  });

  it('ignores a malformed cursor and treats it as the first page', async () => {
    await POST(req({ ...AUTH, cursor: { createdAt: 123, id: 'nope' } }));
    expect(fetchHistoryPage).toHaveBeenCalledWith('ST1PAYER', null);
  });

  it('500 when the DB read fails', async () => {
    m(fetchHistoryPage).mockRejectedValue(new Error('boom'));
    const res = await POST(req({ ...AUTH }));
    expect(res.status).toBe(500);
  });
});
