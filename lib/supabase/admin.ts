import 'server-only';

import { createAdminClient as createSupabaseAdminClient } from '@supabase/server/core';
import type { Database } from './database.types';
import {
  getSupabaseAdminSecret,
  getSupabasePublicConfig,
} from '@/lib/env/server';

/** Server-only client. Never import this from client components. */
export function createAdminClient() {
  const { url } = getSupabasePublicConfig();
  const secretKey = getSupabaseAdminSecret();

  return createSupabaseAdminClient<Database>({
    env: {
      url,
      secretKeys: { default: secretKey },
      publishableKeys: {},
      jwks: null,
    },
  });
}
