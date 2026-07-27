import { createBrowserClient } from '@supabase/ssr';
import { Database } from './database.types';

let clientInstance: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Creates or reuses a singleton client-side Supabase instance for browser interaction.
 * Prevents redundant object allocations across renders.
 */
export function createClient() {
  if (clientInstance) return clientInstance;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
    console.warn(
      '⚠️ [Supabase Warning]: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or invalid in your .env file!'
    );
  }

  clientInstance = createBrowserClient<Database>(
    supabaseUrl && supabaseUrl.trim() ? supabaseUrl : 'https://placeholder.supabase.co',
    supabaseAnonKey && supabaseAnonKey.trim() ? supabaseAnonKey : 'placeholder-anon-key'
  );

  return clientInstance;
}
