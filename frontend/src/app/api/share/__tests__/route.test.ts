import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/invoices', () => ({ getGeneration: vi.fn() }));
vi.mock('@/lib/share', () => ({ mintShareSlug: vi.fn(), clearShareSlug: vi.fn() }));
vi.mock('@/lib/session', () => ({
  SESSION_COOKIE: 'tg_session',
  verifySessionToken: vi.fn(),
  createSessionToken: vi.fn(() => 'minted-token'),
  sessionCookieOptions: vi.fn(() => ({ path: '/' })),
}));

import { POST, DELETE } from '../route';
import * as invoices from '@/lib/invoices';
import * as share from '@/lib/share';
import { verifySessionToken } from '@/lib/session';

const m = vi.mocked;
const INVOICE_ID = 'a'.repeat(64);
const PAYER = 'ST1PAYER';

function req(body: unknown, cookie?: string) {
  return {
    json: async () => body,
    cookies: { get: () => (cookie ? { value: cookie } : undefined) },
  } as unknown as Parameters<typeof POST>[0];
}

function gen(overrides: Partial<invoices.Generation> = {}): invoices.Generation {
  return {
    invoice_id: INVOICE_ID, service_id: 'x-thread', payer_address: PAYER,
    token: 'STX', amount: 100000, tx_id: '0xtx', thread_content: ['hook', 'cta'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m(verifySessionToken).mockReturnValue({ address: PAYER });
});

describe('POST /api/share', () => {
  it('400 on a malformed invoiceId', async () => {
    const res = await POST(req({ invoiceId: 'nope' }, 'cookie'));
    expect(res.status).toBe(400);
  });

  it('401 when unauthenticated', async () => {
    m(verifySessionToken).mockReturnValue(null);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(401);
  });

  it('404 when no generation exists', async () => {
    m(invoices.getGeneration).mockResolvedValue(null);
    const res = await POST(req({ invoiceId: INVOICE_ID }, 'cookie'));
    expect(res.status).toBe(404);
  });

  it('403 when the signer is not the payer', async () => {
    m(invoices.getGeneration).mockResolvedValue(gen({ payer_address: 'ST1OTHER' }));
    const res = await POST(req({ invoiceId: INVOICE_ID }, 'cookie'));
    expect(res.status).toBe(403);
    expect(share.mintShareSlug).not.toHaveBeenCalled();
  });

  it('mints a slug for the owner', async () => {
    m(invoices.getGeneration).mockResolvedValue(gen());
    m(share.mintShareSlug).mockResolvedValue('SLUG123');
    const res = await POST(req({ invoiceId: INVOICE_ID }, 'cookie'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ slug: 'SLUG123' });
    expect(share.mintShareSlug).toHaveBeenCalledWith(INVOICE_ID);
  });

  it('is idempotent: returns the existing slug without re-minting', async () => {
    m(invoices.getGeneration).mockResolvedValue(gen({ share_slug: 'EXISTING' }));
    const res = await POST(req({ invoiceId: INVOICE_ID }, 'cookie'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ slug: 'EXISTING' });
    expect(share.mintShareSlug).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/share', () => {
  it('403 when the signer is not the payer', async () => {
    m(invoices.getGeneration).mockResolvedValue(gen({ payer_address: 'ST1OTHER' }));
    const res = await DELETE(req({ invoiceId: INVOICE_ID }, 'cookie'));
    expect(res.status).toBe(403);
    expect(share.clearShareSlug).not.toHaveBeenCalled();
  });

  it('clears the slug for the owner', async () => {
    m(invoices.getGeneration).mockResolvedValue(gen({ share_slug: 'EXISTING' }));
    m(share.clearShareSlug).mockResolvedValue(undefined);
    const res = await DELETE(req({ invoiceId: INVOICE_ID }, 'cookie'));
    expect(res.status).toBe(200);
    expect(share.clearShareSlug).toHaveBeenCalledWith(INVOICE_ID);
  });
});
