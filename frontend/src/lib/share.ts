import crypto from 'crypto';
import { supabase } from './supabase';
import { displayTopic, type InvoiceRel } from './history';

// Server-only. Owns sharing's DB shape. Ownership (signer == payer_address) is
// enforced by the route before these are called (mirrors the regenerate flow).

export type PublicThread = {
  invoice_id: string;
  service_id: string;
  token: string;
  amount: number;
  tx_id: string;
  thread_content: string[];
  topic: string | null;
};

type RawPublicRow = {
  invoice_id: string;
  service_id: string | null;
  token: string;
  amount: number;
  tx_id: string;
  thread_content: string[];
  invoices: InvoiceRel | InvoiceRel[] | null;
};

// Pure: flatten a generations row joined to its invoice into the public shape.
export function normalizePublicRow(raw: RawPublicRow): PublicThread {
  const rel = Array.isArray(raw.invoices) ? raw.invoices[0] : raw.invoices;
  return {
    invoice_id: raw.invoice_id,
    service_id: raw.service_id ?? 'x-thread',
    token: raw.token,
    amount: raw.amount,
    tx_id: raw.tx_id,
    thread_content: raw.thread_content,
    topic: displayTopic(rel ?? undefined),
  };
}

// Public-page read. A NULL share_slug never matches, so private threads (and
// junk slugs) return null.
export async function getGenerationBySlug(slug: string): Promise<PublicThread | null> {
  const { data, error } = await supabase
    .from('generations')
    .select('invoice_id, service_id, token, amount, tx_id, thread_content, invoices(topic, params)')
    .eq('share_slug', slug)
    .maybeSingle();
  if (error) throw new Error(`getGenerationBySlug: ${error.message}`);
  return data ? normalizePublicRow(data as unknown as RawPublicRow) : null;
}

// Mint a fresh slug for an already-private generation. Only updates the row when
// share_slug is still NULL; if a concurrent request beat us, re-read and return
// the slug that won. Caller has already verified ownership and that no slug exists.
export async function mintShareSlug(invoiceId: string): Promise<string> {
  const slug = crypto.randomBytes(16).toString('base64url');
  const { data, error } = await supabase
    .from('generations')
    .update({ share_slug: slug, shared_at: new Date().toISOString() })
    .eq('invoice_id', invoiceId)
    .is('share_slug', null)
    .select('share_slug')
    .maybeSingle();
  if (error) throw new Error(`mintShareSlug: ${error.message}`);
  if (data?.share_slug) return data.share_slug;
  // Lost the race: a concurrent mint set it first. Re-read the winning slug.
  const reread = await supabase
    .from('generations').select('share_slug').eq('invoice_id', invoiceId).maybeSingle();
  if (reread.error) throw new Error(`mintShareSlug reread: ${reread.error.message}`);
  if (!reread.data?.share_slug) throw new Error('mintShareSlug: no slug after update');
  return reread.data.share_slug;
}

// Un-share: drop the slug (and timestamp). Idempotent.
export async function clearShareSlug(invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('generations')
    .update({ share_slug: null, shared_at: null })
    .eq('invoice_id', invoiceId);
  if (error) throw new Error(`clearShareSlug: ${error.message}`);
}
