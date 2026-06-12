import { NextRequest, NextResponse } from 'next/server';
import {
  createInvoice, getInvoice, getGeneration, claimInvoice, releaseInvoice,
  saveGenerationAndConsume, isExpired,
} from '@/lib/invoices';
import { fetchReceipt } from '@/lib/receipt';
import { generateThread } from '@/lib/generate-thread';
import { CONTRACT, SBTC_CONTRACT, TONES, LENGTHS, type Tone } from '@/lib/config';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  // ── Nhanh 1: chua co proof → bao gia (HTTP 402) ──
  if (!body.invoiceId) {
    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    const tone = body.tone as Tone;
    const length = Number(body.length);
    if (!topic || topic.length > 300) {
      return NextResponse.json({ error: 'topic is required (max 300 chars)' }, { status: 400 });
    }
    if (!TONES.includes(tone) || !LENGTHS.includes(length as 5 | 8 | 12)) {
      return NextResponse.json({ error: 'invalid tone or length' }, { status: 400 });
    }
    const invoice = await createInvoice(topic, tone, length);
    return NextResponse.json({
      invoiceId: invoice.invoice_id,
      priceStx: invoice.price_stx,
      priceSbtc: invoice.price_sbtc,
      contract: CONTRACT,
      sbtcContract: SBTC_CONTRACT,
      expiresAt: invoice.expires_at,
    }, { status: 402 });
  }

  // ── Nhanh 2: co proof → verify receipt on-chain → generate ──
  const invoice = await getInvoice(body.invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
  }
  if (invoice.status === 'consumed') {
    // Da generate roi → tra lai ket qua cu (chong mat ket qua / double request)
    const existing = await getGeneration(invoice.invoice_id);
    if (existing) {
      return NextResponse.json({ thread: existing.thread_content, invoiceId: invoice.invoice_id });
    }
    return NextResponse.json({ error: 'invoice already consumed' }, { status: 409 });
  }
  if (invoice.status === 'generating') {
    // Mot request khac dang generate → tra ket qua neu xong, khong thi 202.
    const existing = await getGeneration(invoice.invoice_id);
    if (existing) {
      return NextResponse.json({ thread: existing.thread_content, invoiceId: invoice.invoice_id });
    }
    return NextResponse.json({ error: 'generation in progress, retry shortly' }, { status: 202 });
  }

  // Verify thanh toan on-chain TRUOC khi xet het han: mot payment confirm muon
  // (invoice da qua expires_at) van phai duoc honor — neu khong user mat tien.
  const receipt = await fetchReceipt(invoice.invoice_id);
  if (!receipt) {
    // Chua co payment on-chain. Neu invoice het han ma chua tra → coi nhu bo.
    if (isExpired(invoice)) {
      return NextResponse.json({ error: 'invoice expired, request a new quote' }, { status: 410 });
    }
    return NextResponse.json({ error: 'payment not found on-chain yet' }, { status: 402 });
  }
  const required = receipt.token === 'STX'
    ? BigInt(invoice.price_stx) : BigInt(invoice.price_sbtc);
  if (receipt.amount < required) {
    return NextResponse.json({ error: 'underpaid' }, { status: 402 });
  }

  // Khoa atomic: chi request gianh duoc pending → generating moi goi LLM.
  // Chong double-spend khi co request song song cung invoiceId.
  const claimed = await claimInvoice(invoice.invoice_id);
  if (!claimed) {
    const existing = await getGeneration(invoice.invoice_id);
    if (existing) {
      return NextResponse.json({ thread: existing.thread_content, invoiceId: invoice.invoice_id });
    }
    return NextResponse.json({ error: 'generation in progress, retry shortly' }, { status: 202 });
  }

  let thread: string[];
  try {
    thread = await generateThread(invoice.topic, invoice.tone as Tone, invoice.length);
  } catch (e) {
    // LLM loi → nha khoa de user retry mien phi (receipt van con on-chain).
    await releaseInvoice(invoice.invoice_id);
    const message = e instanceof Error ? e.message : 'generation failed';
    return NextResponse.json(
      { error: `generation failed, payment preserved, retry: ${message}` },
      { status: 500 },
    );
  }

  const gen = await saveGenerationAndConsume({
    invoice_id: invoice.invoice_id,
    payer_address: receipt.payer,
    token: receipt.token,
    amount: Number(receipt.amount),
    tx_id: typeof body.txId === 'string' ? body.txId : '',
    thread_content: thread,
  });

  return NextResponse.json({ thread: gen.thread_content, invoiceId: invoice.invoice_id });
}
