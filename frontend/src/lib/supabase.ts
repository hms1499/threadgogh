import { createClient } from '@supabase/supabase-js';

// Service-role client — CHI dung trong API routes (server).
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
