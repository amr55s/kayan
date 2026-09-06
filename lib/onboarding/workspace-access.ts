import 'server-only';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

type MerchantWorkspace = { workspaceId: string; merchantId: string };

/** The cookie chooses among allowed resources; it never grants access. */
export async function resolveMerchantWorkspace(): Promise<MerchantWorkspace | null> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;
  const { data, error } = await (supabase as any).rpc('list_my_activity_workspaces');
  if (error || !Array.isArray(data)) return null;
  const preferred = (await cookies()).get('dairtak_workspace')?.value;
  const candidates = data.filter((workspace: Record<string, unknown>) =>
    workspace.status === 'approved' && typeof workspace.id === 'string'
      && typeof workspace.merchantId === 'string');
  candidates.sort((left: Record<string, unknown>, right: Record<string, unknown>) =>
    Number(right.id === preferred) - Number(left.id === preferred));
  for (const candidate of candidates) {
    // Recheck the actual merchant, including suspension and membership changes.
    const { data: allowed, error: accessError } = await (supabase as any)
      .rpc('can_manage_merchant', { p_merchant_id: candidate.merchantId });
    if (!accessError && allowed === true) {
      return { workspaceId: candidate.id as string, merchantId: candidate.merchantId as string };
    }
  }
  return null;
}
