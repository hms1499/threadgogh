import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock cac bien gioi I/O cua route (DB, on-chain, LLM).
vi.mock('@/lib/invoices', () => ({
  createInvoice: vi.fn(),
  getInvoice: vi.fn(),
  getGeneration: vi.fn(),
  claimInvoice: vi.fn(),
  releaseInvoice: vi.fn(),
  saveGenerationAndConsume: vi.fn(),
  isExpired: vi.fn(),
}));
vi.mock('@/lib/receipt', () => ({ fetchReceipt: vi.fn() }));
vi.mock('@/lib/generate-thread', () => ({ generateThread: vi.fn() }));

import { POST } from '../route';
import * as invoices from '@/lib/invoices';
import { fetchReceipt } from '@/lib/receipt';
import { generateThread } from '@/lib/generate-thread';

const m = vi.mocked;

// NextRequest gia: route chi goi req.json()
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

describe('POST /api/generate — bao gia (nhanh 1)', () => {
  it('tra 402 + invoice moi khi chua co invoiceId', async () => {
    m(invoices.createInvoice).mockResolvedValue(baseInvoice());
    const res = await POST(req({ topic: 'bitcoin layer 2', tone: 'educational', length: 5 }));
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.invoiceId).toBe(INVOICE_ID);
    expect(json.priceStx).toBe(100000);
  });

  it('tra 400 khi tone/length khong hop le', async () => {
    const res = await POST(req({ topic: 'x', tone: 'nope', length: 99 }));
    expect(res.status).toBe(400);
    expect(invoices.createInvoice).not.toHaveBeenCalled();
  });
});

describe('POST /api/generate — verify + generate (nhanh 2)', () => {
  it('tra 404 khi invoice khong ton tai', async () => {
    m(invoices.getInvoice).mockResolvedValue(null);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(404);
  });

  it('invoice consumed -> tra lai thread cu, khong goi LLM', async () => {
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

  it('chua co receipt va chua het han -> 402, khong goi LLM', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice());
    m(invoices.isExpired).mockReturnValue(false);
    m(fetchReceipt).mockResolvedValue(null);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(402);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('chua co receipt va da het han -> 410', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice());
    m(invoices.isExpired).mockReturnValue(true);
    m(fetchReceipt).mockResolvedValue(null);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(410);
  });

  // MUC 1: receipt on-chain phai duoc honor ngay ca khi invoice da het han.
  it('da tra tien nhung invoice het han -> VAN generate (khong mat tien)', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice());
    m(invoices.isExpired).mockReturnValue(true); // het han
    m(fetchReceipt).mockResolvedValue(stxReceipt); // nhung da tra on-chain
    m(invoices.claimInvoice).mockResolvedValue(true);
    m(generateThread).mockResolvedValue(['t1', 't2']);
    m(invoices.saveGenerationAndConsume).mockImplementation(async (g) => g);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(200);
    expect((await res.json()).thread).toEqual(['t1', 't2']);
    expect(generateThread).toHaveBeenCalledTimes(1);
  });

  it('tra thieu -> 402 underpaid, khong goi LLM', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice());
    m(invoices.isExpired).mockReturnValue(false);
    m(fetchReceipt).mockResolvedValue({ ...stxReceipt, amount: 99999n });
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(402);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('thanh toan hop le -> claim thang -> generate va luu', async () => {
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

  // MUC 2: hai request song song -> chi mot cai generate.
  it('thua claim (request song song) -> KHONG goi LLM, tra 202', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice());
    m(invoices.isExpired).mockReturnValue(false);
    m(fetchReceipt).mockResolvedValue(stxReceipt);
    m(invoices.claimInvoice).mockResolvedValue(false); // request kia da claim
    m(invoices.getGeneration).mockResolvedValue(null); // winner chua xong
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(202);
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('thua claim nhung generation da xong -> tra thread cu', async () => {
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

  it('status=generating va chua co ket qua -> 202', async () => {
    m(invoices.getInvoice).mockResolvedValue(baseInvoice({ status: 'generating' }));
    m(invoices.getGeneration).mockResolvedValue(null);
    const res = await POST(req({ invoiceId: INVOICE_ID }));
    expect(res.status).toBe(202);
    expect(fetchReceipt).not.toHaveBeenCalled();
    expect(generateThread).not.toHaveBeenCalled();
  });

  it('LLM loi sau khi claim -> release invoice de retry mien phi, tra 500', async () => {
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
