import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { getSupabasePublicConfig } from '@/lib/env/server';

/** Anonymous client for the public directory; safe to use without request cookies. */
export function createPublicClient() {
  const { url, publishableKey: key } = getSupabasePublicConfig();
  if (!url || !key || url.includes('placeholder') || key.includes('placeholder')) {
    throw new Error('إعدادات قاعدة البيانات العامة غير مكتملة.');
  }
  return createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
