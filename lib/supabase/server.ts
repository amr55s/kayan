import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from './database.types';

/**
 * Creates a server-side Supabase client for Server Components, Server Actions, and Route Handlers.
 * Fully compatible with Next.js 15+ async cookies() and latest @supabase/ssr.
 */
export async function createClient() {
  const cookieStore = await cookies();

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabaseUrl = rawUrl && rawUrl.trim() ? rawUrl : 'https://placeholder.supabase.co';
  const supabaseAnonKey = rawKey && rawKey.trim() ? rawKey : 'placeholder-anon-key';

  return createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      global: {
        fetch: (url: RequestInfo | URL, options?: RequestInit) => {
          return fetch(url, {
            ...options,
            signal: options?.signal || AbortSignal.timeout(10_000),
          });
        },
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}
