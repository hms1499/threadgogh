import crypto from 'crypto';
import { supabase } from './supabase';
import { PRICE_STX, PRICE_SBTC, INVOICE_TTL_MINUTES } from './config';

export type Invoice = {
  invoice_id: string;
  topic: string;
  tone: string;
  length: number;
  price_stx: number;
  price_sbtc: number;
  status: 'pending' | 'paid' | 'generating' | 'consumed';
  expires_at: string;
};

export function isExpired(invoice: Pick<Invoice, 'expires_at'>): boolean {
  return new Date(invoice.expires_at).getTime() < Date.now();
}

export async function createInvoice(
  topic: string, tone: string, length: number,
): Promise<Invoice> {
  const invoice: Invoice = {
    invoice_id: crypto.randomBytes(32).toString('hex'),
    topic, tone, length,
    price_stx: PRICE_STX,
    price_sbtc: PRICE_SBTC,
    status: 'pending',
    expires_at: new Date(Date.now() + INVOICE_TTL_MINUTES * 60_000).toISOString(),
  };
  const { error } = await supabase.from('invoices').insert(invoice);
  if (error) throw new Error(`createInvoice: ${error.message}`);
  return invoice;
}

export async function getInvoice(invoiceId: string): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('invoices').select('*').eq('invoice_id', invoiceId).maybeSingle();
  if (error) throw new Error(`getInvoice: ${error.message}`);
  return data;
}

// Khoa generation atomic: chi mot request chuyen duoc pending -> generating.
// DB dam bao transition nay race-safe (chi 1 row khop status='pending').
// Tra true neu request nay gianh duoc quyen generate, false neu da co request khac.
export async function claimInvoice(invoiceId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('invoices').update({ status: 'generating' })
    .eq('invoice_id', invoiceId).eq('status', 'pending')
    .select('invoice_id');
  if (error) throw new Error(`claimInvoice: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// Nha khoa khi generation that bai: generating -> pending, cho phep retry mien phi
// (receipt van con on-chain nen lan sau van verify duoc).
export async function releaseInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('invoices').update({ status: 'pending' })
    .eq('invoice_id', invoiceId).eq('status', 'generating');
  if (error) throw new Error(`releaseInvoice: ${error.message}`);
}

export type Generation = {
  invoice_id: string;
  payer_address: string;
  token: string;
  amount: number;
  tx_id: string;
  thread_content: string[];
};

export async function getGeneration(invoiceId: string): Promise<Generation | null> {
  const { data, error } = await supabase
    .from('generations').select('*').eq('invoice_id', invoiceId).maybeSingle();
  if (error) throw new Error(`getGeneration: ${error.message}`);
  return data;
}

// Atomic consume: unique constraint tren invoice_id la chot chong double-spend.
// Insert thanh cong → minh la nguoi dau tien → set consumed.
// Insert dinh unique violation (23505) → da co generation → tra ban cu.
export async function saveGenerationAndConsume(gen: Generation): Promise<Generation> {
  const { error } = await supabase.from('generations').insert(gen);
  if (error) {
    if (error.code === '23505') {
      const existing = await getGeneration(gen.invoice_id);
      if (existing) return existing;
    }
    throw new Error(`saveGeneration: ${error.message}`);
  }
  await supabase.from('invoices')
    .update({ status: 'consumed' }).eq('invoice_id', gen.invoice_id);
  return gen;
}
