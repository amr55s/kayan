import 'server-only';

import { createAdminClient as createSupabaseAdminClient } from '@supabase/server/core';
import type { Database } from './database.types';

/** Server-only client. Never import this from client components. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) {
    throw new Error('Supabase secret credentials are required for server operations.');
  }

  return createSupabaseAdminClient<Database>({
    env: {
      url,
      secretKeys: { default: secretKey },
      publishableKeys: {},
      jwks: null,
    },
  });
}
