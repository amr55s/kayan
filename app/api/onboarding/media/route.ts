import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteMediaObject, getPrivateMediaBucketName, writePrivateMediaObject } from '@/lib/media/spaces';

export const runtime = 'nodejs';
export const maxDuration = 30;
const MAX_BYTES = 3 * 1024 * 1024;

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'origin_required' }, { status: 403 });
  }
  const draftId = z.uuid().safeParse(request.headers.get('x-draft-id'));
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
  if (!draftId.success || !allowedTypes.includes(request.headers.get('content-type') ?? '')) {
    return Response.json({ error: 'invalid_image' }, { status: 400 });
  }
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user || !user.identities?.some(identity => identity.provider === 'google')) {
    return Response.json({ error: 'authentication_required' }, { status: 401 });
  }
  const admin = createAdminClient() as any;
  const { data: draft, error: draftError } = await admin.from('onboarding_drafts')
    .select('id').eq('id', draftId.data).eq('user_id', user.id).eq('status', 'draft').maybeSingle();
  if (draftError || !draft) return Response.json({ error: 'draft_not_found' }, { status: 404 });
  const { data: allowed, error: rateError } = await admin.rpc('consume_public_submission_rate_limit', {
    p_request_key: createHash('sha256').update(`onboarding-media:${user.id}`).digest('hex'), p_limit: 30,
  });
  if (rateError || !allowed) return Response.json({ error: 'try_later' }, { status: 429 });
  // Cap the actual streamed body, not only the client-controlled Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: 'empty_image' }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return Response.json({ error: 'image_too_large' }, { status: 413 });
      }
      chunks.push(value);
    }
  } catch {
    return Response.json({ error: 'image_transfer_failed' }, { status: 400 });
  } finally {
    reader.releaseLock();
  }
  let bytes: Buffer;
  let width: number;
  let height: number;
  try {
    const image = sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000, animated: false });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp', 'avif', 'heif'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) throw new Error('invalid');
    const converted = await image.rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    bytes = converted.data; width = converted.info.width; height = converted.info.height;
    if (bytes.length < 32 || bytes.length > MAX_BYTES) throw new Error('invalid');
  } catch {
    return Response.json({ error: 'invalid_image' }, { status: 400 });
  }
  const assetId = randomUUID();
  const objectKey = `onboarding/${user.id}/${draftId.data}/${assetId}.webp`;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  try {
    await writePrivateMediaObject({ body: bytes, checksumSha256: sha256, contentType: 'image/webp', objectKey });
    try {
      const { error } = await admin.from('onboarding_media_assets').insert({
        id: assetId, owner_id: user.id, draft_id: draftId.data, bucket: getPrivateMediaBucketName(),
        object_key: objectKey, content_type: 'image/webp', byte_size: bytes.length, sha256, width, height,
      });
      if (error) throw new Error('registry_failed');
    } catch {
      // A network error can follow a committed INSERT. Never delete a saved image
      // merely because its acknowledgement was lost. Reconcile against the same ID.
      const { data: registered, error: reconciliationError } = await admin.from('onboarding_media_assets')
        .select('id').eq('id', assetId).eq('owner_id', user.id).eq('draft_id', draftId.data).maybeSingle();
      if (reconciliationError) throw new Error('registry_state_unknown');
      if (!registered) {
        // Confirmed absent: only remove this request's freshly uploaded private object.
        await deleteMediaObject(objectKey).catch(() => undefined);
        throw new Error('registry_failed');
      }
    }
    return Response.json({ assetId }, { status: 201, headers: { 'cache-control': 'private, no-store' } });
  } catch {
    return Response.json({ error: 'storage_unavailable' }, { status: 503 });
  }
}
