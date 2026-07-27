import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** Anonymous client for the public directory; safe to use without request cookies. */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || url.includes('placeholder') || key.includes('placeholder')) {
    throw new Error('إعدادات قاعدة البيانات العامة غير مكتملة.');
  }
  return createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
