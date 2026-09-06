import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import { createAdminClient } from '@/lib/supabase/admin';
import { readPrivateMediaObject } from '@/lib/media/spaces';

export const dynamic = 'force-dynamic';
const assetSchema = z.object({ object_key: z.string(), owner_id: z.uuid(), draft_id: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), content_type: z.literal('image/webp'),
});
export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  try { await requireMarketplaceAdminRole(['super_admin'], { failureMode: 'throw' }); }
  catch { return new Response(null, { status: 403 }); }
  const id = z.uuid().safeParse((await context.params).assetId);
  if (!id.success) return new Response(null, { status: 404 });
  const admin = createAdminClient() as any;
  const { data: rawAsset, error } = await admin.from('onboarding_media_assets')
    .select('object_key,owner_id,draft_id,sha256,content_type').eq('id', id.data).maybeSingle();
  const parsed = assetSchema.safeParse(rawAsset);
  if (error || !parsed.success) return new Response(null, { status: 404 });
  const asset = parsed.data;
  if (asset.object_key !== `onboarding/${asset.owner_id}/${asset.draft_id}/${id.data}.webp`) return new Response(null, { status: 404 });
  const { data: draft, error: draftError } = await admin.from('onboarding_drafts').select('request_id')
    .eq('id', asset.draft_id).eq('user_id', asset.owner_id).not('request_id','is',null).maybeSingle();
  if (draftError || !draft) return new Response(null, { status: 404 });
  // A rejected request retains its submitted image snapshot; newly added unsent assets
  // are not reviewable just because this draft had an older request_id.
  const { data: accountRequest, error: requestError } = await admin.from('account_requests')
    .select('place_images').eq('id', draft.request_id).eq('auth_user_id', asset.owner_id).maybeSingle();
  if (requestError || !Array.isArray(accountRequest?.place_images)
    || !accountRequest.place_images.includes(`dairtak-upload:${id.data}`)) return new Response(null, { status: 404 });
  try {
    const bytes = await readPrivateMediaObject(asset.object_key,3*1024*1024);
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) return new Response(null, { status: 503 });
    return new Response(new Uint8Array(bytes), { headers: { 'content-type':'image/webp','cache-control':'private, no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin' } });
  } catch { return new Response(null, { status: 503 }); }
}
