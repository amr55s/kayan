import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readPrivateMediaObject } from '@/lib/media/spaces';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  const id = z.uuid().safeParse((await context.params).assetId);
  if (!id.success) return new Response(null, { status: 404 });
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const admin = createAdminClient() as any;
  const { data: asset, error } = await admin.from('onboarding_media_assets')
    .select('object_key,draft_id').eq('id', id.data).eq('owner_id', user.id).maybeSingle();
  if (error || !asset || !asset.object_key.startsWith(`onboarding/${user.id}/${asset.draft_id}/`)) {
    return new Response(null, { status: 404 });
  }
  try {
    const bytes = await readPrivateMediaObject(asset.object_key, 3 * 1024 * 1024);
    return new Response(new Uint8Array(bytes), { headers: {
      'content-type': 'image/webp', 'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff', 'content-disposition': 'inline',
      'cross-origin-resource-policy': 'same-origin',
    } });
  } catch { return new Response(null, { status: 503 }); }
}
