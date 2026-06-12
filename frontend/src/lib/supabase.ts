import { createClient } from '@supabase/supabase-js';

// Service-role client — ONLY use inside API routes (server). Validate here so a
// missing var fails with a clear message at import time, not a cryptic
// "supabaseUrl is required" deep inside the SDK.
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  const missing = [
    !url && 'SUPABASE_URL',
    !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean).join(', ');
  throw new Error(`Missing server env: ${missing}. See frontend/.env.example`);
}

export const supabase = createClient(url, serviceKey);
