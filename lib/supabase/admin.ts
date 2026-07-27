import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** Server-only client. Never import this from client components. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase service role credentials are required for account provisioning.');
  }
  return createSupabaseAdminClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
