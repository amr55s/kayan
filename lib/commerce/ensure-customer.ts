import 'server-only';

import { isMissingDatabaseRoutine } from '@/lib/supabase/missing-routine';
import { logSafeServerFailure } from '@/lib/observability/server-log';

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** Creates a marketplace customer when the schema has that RPC. Older live schemas skip it. */
export async function ensureMarketplaceCustomerProfile(client: RpcClient): Promise<void> {
  const { data, error } = await client.rpc('ensure_marketplace_customer');
  if (isMissingDatabaseRoutine(error)) {
    logSafeServerFailure('warn', 'marketplace_customer_rpc_unavailable', {
      failure: 'routine_missing',
    });
    return;
  }
  if (error || !data) throw error || new Error('customer_profile_missing');
}
