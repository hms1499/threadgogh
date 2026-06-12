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

// Atomic generation lock: only one request can move pending -> generating.
// The DB makes this transition race-safe (only 1 row matches status='pending').
// Returns true if this request won the generation slot, false if another already did.
export async function claimInvoice(invoiceId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('invoices').update({ status: 'generating' })
    .eq('invoice_id', invoiceId).eq('status', 'pending')
    .select('invoice_id');
  if (error) throw new Error(`claimInvoice: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// Release the lock when generation fails: generating -> pending, allowing a free retry
// (the receipt stays on-chain, so the next attempt can still verify it).
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

// Atomic consume: the unique constraint on invoice_id is the anti-double-spend guard.
// Insert succeeds → we're the first → set consumed.
// Insert hits a unique violation (23505) → a generation already exists → return it.
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
