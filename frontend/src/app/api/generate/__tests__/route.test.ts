import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the route's I/O boundaries (DB, on-chain, LLM).
vi.mock('@/lib/invoices', () => ({
  createInvoice: vi.fn(),
  getInvoice: vi.fn(),
  getGeneration: vi.fn(),
  claimInvoice: vi.fn(),
  releaseInvoice: vi.fn(),
  saveGenerationAndConsume: vi.fn(),
  isExpired: vi.fn(),
  isGeneratingStale: vi.fn(),
}));
vi.mock('@/lib/receipt', () => ({ fetchReceipt: vi.fn() }));
vi.mock('@/lib/generate-thread', () => ({ generateThread: vi.fn() }));

import { POST } from '../route';
import * as invoices from '@/lib/invoices';
import { fetchReceipt } from '@/lib/receipt';
import { generateThread } from '@/lib/generate-thread';

const m = vi.mocked;

// Fake NextRequest: the route only calls req.json()
function req(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

const INVOICE_ID = 'a'.repeat(64);

function baseInvoice(overrides: Partial<invoices.Invoice> = {}): invoices.Invoice {
  return {
    invoice_id: INVOICE_ID,
    topic: 'bitcoin layer 2',
    tone: 'educational',
    length: 5,
    price_stx: 100000,
    price_sbtc: 100,
    status: 'pending',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

const stxReceipt = { payer: 'ST1PAYER', amount: 100000n, token: 'STX' as const, paidAt: 1n };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/generate — quote (branch 1)', () => {
  it('returns 402 + a new invoice when no invoiceId', async () => {
    m(invoices.createInvoice).mockResolvedValue(baseInvoice());
    const res = await POST(req({ topic: 'bitcoin layer 2', tone: 'educational', length: 5 }));
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.invoiceId).toBe(INVOICE_ID);
    expect(json.priceStx).toBe(100000);
  });

  it('returns 400 for invalid tone/length', async () => {
    const res = await POST(req({ topic: 'x', tone: 'nope', length: 99 }));
    expect(res.status).toBe(400);
    expect(invoices.createInvoice).not.toHaveBeenCalled();
  });
});

describe('POST /api/generate — verify + generate (branch 2)', () => {
  it('returns 404 when the invoice does not exist', async () => {
    m(invoices.getInvoice).mockResolvedValue(null);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(404);
  });

  it('consumed invoice -> returns cached thread, no LLM call', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice({ status: 'consumed' }));
    m(invoices.getGeneration).mockResolvedValue({
      invoice_id: INVOICE_ID, payer_address: 'ST1PAYER', token: 'STX',
      amount: 100000, tx_id: 'tx', thread_content: ['cu'],
    });
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(200);
    expect((await res.json()).thread).toEqual(['cu']);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('no receipt and not expired -> 402, no LLM call', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice());
    m(invoices.isExpired).mockReturnValue(false);
    m(fetchReceipt).mockResolvedValue(null);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(402);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('no receipt and expired -> 410', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice());
    m(invoices.isExpired).mockReturnValue(true);
    m(fetchReceipt).mockResolvedValue(null);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(410);
  });

  // ITEM 1: an on-chain receipt must be honored even if the invoice has expired.
  it('paid but invoice expired -> STILL generates (no lost funds)', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice());
    m(invoices.isExpired).mockReturnValue(true); // expired
    m(fetchReceipt).mockResolvedValue(stxReceipt); // but already paid on-chain
    m(invoices.claimInvoice).mockResolvedValue(true);
    m(generateThread).mockResolvedValue(['t1', 't2']);
    m(invoices.saveGenerationAndConsume).mockImplementation(async (g) => g);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(200);
    expect((await res.json()).thread).toEqual(['t1', 't2']);
    expect(generateThread).toHaveBeenCalledTimes(1);
  });

  it('underpaid -> 402, no LLM call', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice());
    m(invoices.isExpired).mockReturnValue(false);
    m(fetchReceipt).mockResolvedValue({ ...stxReceipt, amount: 99999n });
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(402);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('valid payment -> wins claim -> generates and saves', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice());
    m(invoices.isExpired).mockReturnValue(false);
    m(fetchReceipt).mockResolvedValue(stxReceipt);
    m(invoices.claimInvoice).mockResolvedValue(true);
    m(generateThread).mockResolvedValue(['hook', 'cta']);
    m(invoices.saveGenerationAndConsume).mockImplementation(async (g) => g);
    const res = await POST(req({ invoiceId: INVOICE_ID, txId: '0xtx' }));
    expect(res.status).toBe(200);
    expect((await res.json()).thread).toEqual(['hook', 'cta']);
    expect(generateThread).toHaveBeenCalledTimes(1);
    expect(invoices.saveGenerationAndConsume).toHaveBeenCalledTimes(1);
  });

  // ITEM 2: two concurrent requests -> only one generates.
  it('loses claim (concurrent request) -> NO LLM call, returns 202', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice());
    m(invoices.isExpired).mockReturnValue(false);
    m(fetchReceipt).mockResolvedValue(stxReceipt);
    m(invoices.claimInvoice).mockResolvedValue(false); // the other request already claimed
    m(invoices.getGeneration).mockResolvedValue(null); // winner not done yet
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(202);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('loses claim but generation already done -> returns cached thread', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice());
    m(invoices.isExpired).mockReturnValue(false);
    m(fetchReceipt).mockResolvedValue(stxReceipt);
    m(invoices.claimInvoice).mockResolvedValue(false);
    m(invoices.getGeneration).mockResolvedValue({
      invoice_id: INVOICE_ID, payer_address: 'ST1PAYER', token: 'STX',
      amount: 100000, tx_id: 'tx', thread_content: ['xong'],
    });
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(200);
    expect((await res.json()).thread).toEqual(['xong']);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('status=generating, FRESH lock, no result yet -> 202 (no reclaim)', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice({ status: 'generating' }));
    m(invoices.getGeneration).mockResolvedValue(null);
    m(invoices.isGeneratingStale).mockReturnValue(false);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(202);
    expect(fetchReceipt).not.toHaveBeenCalled();
    expect(generateThread).not.toHaveBeenCalled();
  });

  // ITEM 1 (senior review): a crashed worker must not strand a paid user forever.
  it('status=generating, STALE lock, no result -> reclaims, re-verifies, generates', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice({ status: 'generating' }));
    m(invoices.getGeneration).mockResolvedValue(null);
    m(invoices.isGeneratingStale).mockReturnValue(true); // previous worker died
    m(invoices.isExpired).mockReturnValue(false);
    m(fetchReceipt).mockResolvedValue(stxReceipt); // payment is on-chain
    m(invoices.claimInvoice).mockResolvedValue(true); // we win the stale slot
    m(generateThread).mockResolvedValue(['recovered']);
    m(invoices.saveGenerationAndConsume).mockImplementation(async (g) => g);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(200);
    expect((await res.json()).thread).toEqual(['recovered']);
    expect(fetchReceipt).toHaveBeenCalledTimes(1);
    expect(generateThread).toHaveBeenCalledTimes(1);
  });

  it('LLM fails after claim -> releases invoice for free retry, returns 500', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice());
    m(invoices.isExpired).mockReturnValue(false);
    m(fetchReceipt).mockResolvedValue(stxReceipt);
    m(invoices.claimInvoice).mockResolvedValue(true);
    m(generateThread).mockRejectedValue(new Error('anthropic down'));
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(500);
    expect(invoices.releaseInvoice).toHaveBeenCalledWith(INVOICE_ID);
    expect(invoices.saveGenerationAndConsume).not.toHaveBeenCalled();
  });
});
