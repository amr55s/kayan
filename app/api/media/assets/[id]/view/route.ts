import {
  createPrivateMediaDownload,
  getPrivateMediaBucketName,
} from '@/lib/media/spaces';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return Response.json({ error: 'media_not_found' }, { status: 404 });
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: 'authentication_required' }, { status: 401 });
    }
    const { data: authorized, error: authorizationError } = await (supabase as any).rpc(
      'authorize_my_private_marketplace_media',
      { p_asset_id: id },
    );
    if (authorizationError || authorized?.authorized !== true) {
      return Response.json({ error: 'media_not_found' }, { status: 404 });
    }

    const admin = createAdminClient() as any;
    const { data: locator, error: locatorError } = await admin.rpc(
      'get_private_marketplace_media_locator',
      { p_asset_id: id, p_actor_id: user.id },
    );
    if (
      locatorError
      || locator?.asset_id !== id
      || locator?.bucket !== getPrivateMediaBucketName()
      || typeof locator?.object_key !== 'string'
      || !locator.object_key.startsWith('media/')
    ) {
      return Response.json({ error: 'media_not_found' }, { status: 404 });
    }
    const signedUrl = await createPrivateMediaDownload(locator.object_key, 60);
    return new Response(null, {
      status: 307,
      headers: {
        'cache-control': 'private, no-store, max-age=0',
        location: signedUrl,
      },
    });
  } catch {
    return Response.json({ error: 'media_unavailable' }, { status: 503 });
  }
}
