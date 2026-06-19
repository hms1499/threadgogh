import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/invoices', () => ({
  getInvoice: vi.fn(),
  getGeneration: vi.fn(),
  regenerateGeneration: vi.fn(),
}));
vi.mock('@/lib/generate-thread', () => ({ generateThread: vi.fn() }));
vi.mock('@/lib/env', () => ({ assertServerEnv: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyHistoryAuth: vi.fn() }));
vi.mock('@/lib/session', () => ({
  SESSION_COOKIE: 'tg_session',
  verifySessionToken: vi.fn(),
  createSessionToken: vi.fn(() => 'minted-token'),
  sessionCookieOptions: vi.fn(() => ({ path: '/' })),
}));

import { POST } from '../route';
import * as invoices from '@/lib/invoices';
import { generateThread } from '@/lib/generate-thread';
import { verifyHistoryAuth } from '@/lib/auth';
import { verifySessionToken, SESSION_COOKIE } from '@/lib/session';

const m = vi.mocked;
const INVOICE_ID = 'a'.repeat(64);
const PAYER = 'ST1PAYER';

function req(body: unknown, cookie?: string) {
  return {
    json: async () => body,
    cookies: { get: () => (cookie ? { value: cookie } : undefined) },
  } as unknown as Parameters<typeof POST>[0];
}

function consumedInvoice(overrides: Partial<invoices.Invoice> = {}): invoices.Invoice {
  return {
    invoice_id: INVOICE_ID, topic: 'bitcoin layer 2', tone: 'educational', length: 5,
    price_stx: 100000, price_sbtc: 100, status: 'consumed',
    expires_at: new Date().toISOString(), ...overrides,
  };
}

function gen(overrides: Partial<invoices.Generation> = {}): invoices.Generation {
  return {
    invoice_id: INVOICE_ID, payer_address: PAYER, token: 'STX', amount: 100000,
    tx_id: 'tx', thread_content: ['old1', 'old2'], regen_count: 0, ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: caller is authenticated as the payer via a valid session cookie.
  m(verifySessionToken).mockReturnValue({ address: PAYER });
  m(verifyHistoryAuth).mockReturnValue({ ok: true });
});

describe('POST /api/regenerate', () => {
  it('400 when invoiceId is missing', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('401 when neither a signature nor a valid session is present', async () => {
    m(verifySessionToken).mockReturnValue(null);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(401);
    expect(invoices.getInvoice).not.toHaveBeenCalled();
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('401 when the provided signature is invalid', async () => {
    m(verifyHistoryAuth).mockReturnValue({ ok: false, reason: 'invalid signature' });
    const res = await POST(req({ invoiceId: INVOICE_ID, address: PAYER, message: 'm', signature: 's' }));
    expect(res.status).toBe(401);
    expect(invoices.getInvoice).not.toHaveBeenCalled();
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('403 when the authenticated address is not the payer', async () => {
    m(verifySessionToken).mockReturnValue({ address: 'ST1SOMEONE-ELSE' });
    m(invoices.getInvoice).mockResolvedValue(consumedInvoice());
    m(invoices.getGeneration).mockResolvedValue(gen());
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(403);
    expect(generateThread).not.toHaveBeenCalled();
    expect(invoices.regenerateGeneration).not.toHaveBeenCalled();
  });

  it('404 when there is no generation to re-roll', async () => {
    m(invoices.getInvoice).mockResolvedValue(consumedInvoice());
    m(invoices.getGeneration).mockResolvedValue(null);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(404);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('409 when the invoice is not consumed', async () => {
    m(invoices.getInvoice).mockResolvedValue(consumedInvoice({ status: 'pending' }));
    m(invoices.getGeneration).mockResolvedValue(gen());
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(409);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('429 when the free re-roll limit is reached', async () => {
    m(invoices.getInvoice).mockResolvedValue(consumedInvoice());
    m(invoices.getGeneration).mockResolvedValue(gen({ regen_count: 3 }));
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(429);
    expect((await res.json()).regenRemaining).toBe(0);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('happy path: re-rolls, returns new thread + remaining count', async () => {
    m(invoices.getInvoice).mockResolvedValue(consumedInvoice());
    m(invoices.getGeneration).mockResolvedValue(gen({ regen_count: 0 }));
    m(generateThread).mockResolvedValue(['new1', 'new2']);
    m(invoices.regenerateGeneration).mockResolvedValue(gen({ thread_content: ['new1', 'new2'], regen_count: 1 }));
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.thread).toEqual(['new1', 'new2']);
    expect(json.regenRemaining).toBe(2); // 3 - 1
    expect(generateThread).toHaveBeenCalledWith('bitcoin layer 2', 'educational', 5);
    expect(invoices.regenerateGeneration).toHaveBeenCalledWith(INVOICE_ID, ['new1', 'new2'], 0);
  });

  it('mints a session cookie when authenticated via a fresh signature', async () => {
    m(invoices.getInvoice).mockResolvedValue(consumedInvoice());
    m(invoices.getGeneration).mockResolvedValue(gen({ regen_count: 0 }));
    m(generateThread).mockResolvedValue(['new1', 'new2']);
    m(invoices.regenerateGeneration).mockResolvedValue(gen({ thread_content: ['new1', 'new2'], regen_count: 1 }));
    const res = await POST(req({ invoiceId: INVOICE_ID, address: PAYER, message: 'm', signature: 's' }));
    expect(res.status).toBe(200);
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe('minted-token');
  });

  it('CAS miss (concurrent re-roll) -> 202, no double count', async () => {
    m(invoices.getInvoice).mockResolvedValue(consumedInvoice());
    m(invoices.getGeneration).mockResolvedValue(gen({ regen_count: 0 }));
    m(generateThread).mockResolvedValue(['new1', 'new2']);
    m(invoices.regenerateGeneration).mockResolvedValue(null); // lost the CAS
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(202);
  });

  it('LLM failure -> 500, regen_count not touched', async () => {
    m(invoices.getInvoice).mockResolvedValue(consumedInvoice());
    m(invoices.getGeneration).mockResolvedValue(gen({ regen_count: 0 }));
    m(generateThread).mockRejectedValue(new Error('llm down'));
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(500);
    expect(invoices.regenerateGeneration).not.toHaveBeenCalled();
  });
});
