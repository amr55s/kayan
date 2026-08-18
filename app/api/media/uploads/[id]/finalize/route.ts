import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  CommerceAccessError,
  requireAuthenticatedUser,
  requireDeliveryProofAccess,
  requireMerchantEntity,
} from '@/lib/commerce/auth';
import { MAX_MEDIA_SOURCE_BYTES } from '@/lib/media/contracts';
import {
  deleteSpaceObject,
  getPublicMediaUrl,
  getSpacesBucketName,
  headSpaceObject,
  readSpaceObject,
  writePrivateMediaObject,
  writePublicMediaObject,
} from '@/lib/media/spaces';
import { processImageForStorage } from '@/lib/images/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('media_')) return message.slice(0, 80);
  return 'media_finalize_failed';
}

async function loadFinalizedMediaResponse(admin: any, assetId: string) {
  const { data: asset, error: assetError } = await admin
    .from('media_assets')
    .select('id,entity_type,entity_id,public_url,visibility,width,height')
    .eq('id', assetId)
    .eq('status', 'active')
    .maybeSingle();
  if (assetError || !asset) return null;

  const [productImage, storeImage] = await Promise.all([
    admin.from('product_images').select('position').eq('media_asset_id', assetId).maybeSingle(),
    admin.from('store_images').select('position').eq('media_asset_id', assetId).maybeSingle(),
  ]);
  let revisionPosition: number | undefined;
  if (!productImage.data && asset.entity_type === 'product') {
    const { data: revision } = await admin
      .from('product_revisions')
      .select('image_snapshot')
      .eq('product_id', asset.entity_id)
      .eq('status', 'pending')
      .maybeSingle();
    if (Array.isArray(revision?.image_snapshot)) {
      const index = revision.image_snapshot.findIndex((item: unknown) => (
        typeof item === 'object' && item !== null
        && 'asset_id' in item && item.asset_id === assetId
      ));
      if (index >= 0) revisionPosition = index;
    }
  }
  if (!storeImage.data && asset.entity_type === 'store') {
    const { data: revision } = await admin
      .from('store_revisions')
      .select('image_snapshot')
      .eq('store_id', asset.entity_id)
      .eq('status', 'pending')
      .maybeSingle();
    if (Array.isArray(revision?.image_snapshot)) {
      const index = revision.image_snapshot.findIndex((item: unknown) => (
        typeof item === 'object' && item !== null
        && 'asset_id' in item && item.asset_id === assetId
      ));
      if (index >= 0) revisionPosition = index;
    }
  }
  return {
    assetId: asset.id,
    publicUrl: asset.public_url,
    viewUrl: asset.visibility === 'private' ? `/api/media/assets/${asset.id}/view` : undefined,
    width: asset.width,
    height: asset.height,
    position: Number(productImage.data?.position ?? storeImage.data?.position ?? revisionPosition ?? 0),
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  const requestId = request.headers.get('x-vercel-id') || crypto.randomUUID();
  let finalObjectKey: string | null = null;
  let sessionId: string | null = null;
  try {
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) {
      return Response.json({ error: 'invalid_upload_session' }, { status: 400 });
    }
    sessionId = id;
    const user = await requireAuthenticatedUser();
    const admin = createAdminClient();
    const { data: session, error: sessionError } = await (admin as any)
      .from('upload_sessions')
      .select('id,owner_id,merchant_id,store_id,entity_type,entity_id,slot,staging_key,expected_content_type,expected_size_bytes,expected_sha256,status,expires_at,finalized_asset_id')
      .eq('id', id)
      .maybeSingle();
    if (sessionError || !session || session.owner_id !== user.id) {
      return Response.json({ error: 'upload_session_not_found' }, { status: 404 });
    }
    const access = session.entity_type === 'delivery_proof'
      ? await requireDeliveryProofAccess(session.entity_id)
      : await requireMerchantEntity({
          entityId: session.entity_id,
          merchantId: session.merchant_id,
          purpose: session.entity_type,
        });
    if (access.storeId !== session.store_id || access.merchantId !== session.merchant_id) {
      return Response.json({ error: 'upload_session_not_found' }, { status: 404 });
    }
    if (session.status === 'ready' && session.finalized_asset_id) {
      const response = await loadFinalizedMediaResponse(admin, session.finalized_asset_id);
      if (response) return Response.json(response, { headers: { 'cache-control': 'private, no-store' } });
    }
    if (session.status !== 'staging') {
      return Response.json({ error: 'upload_session_not_ready' }, { status: 409 });
    }
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      return Response.json({ error: 'upload_session_expired' }, { status: 410 });
    }

    const { data: locked } = await (admin as any)
      .from('upload_sessions')
      .update({ status: 'processing' })
      .eq('id', id)
      .eq('status', 'staging')
      .select('id')
      .maybeSingle();
    if (!locked) return Response.json({ error: 'upload_session_busy' }, { status: 409 });

    const head = await headSpaceObject(session.staging_key);
    const contentLength = Number(head.ContentLength ?? 0);
    const contentType = head.ContentType?.split(';')[0]?.trim().toLowerCase();
    if (contentLength !== Number(session.expected_size_bytes) || contentLength > MAX_MEDIA_SOURCE_BYTES) {
      throw new Error('media_size_mismatch');
    }
    if (contentType !== session.expected_content_type) throw new Error('media_type_mismatch');
    if (head.Metadata?.sha256 !== session.expected_sha256) throw new Error('media_metadata_mismatch');

    const source = await readSpaceObject(session.staging_key, MAX_MEDIA_SOURCE_BYTES);
    if (sha256(source) !== session.expected_sha256) throw new Error('media_checksum_mismatch');
    const processed = await processImageForStorage(source, { alwaysReencode: true });
    const processedChecksum = sha256(processed.buffer);
    // One upload session owns one deterministic asset/object identity. This
    // makes a retry safe even when the database committed but the HTTP response
    // was lost.
    const assetId = session.id;
    const idempotencyKey = `media-finalize:${session.id}`;
    finalObjectKey = `media/${session.merchant_id}/${session.entity_type}/${session.entity_id}/${assetId}.webp`;
    const isPublic = session.entity_type === 'product' || session.entity_type === 'store';
    const publicUrl = isPublic ? getPublicMediaUrl(finalObjectKey) : null;
    const writeFinalObject = isPublic ? writePublicMediaObject : writePrivateMediaObject;

    await writeFinalObject({
      body: processed.buffer,
      checksumSha256: processedChecksum,
      contentType: processed.contentType,
      objectKey: finalObjectKey,
    });
    const { data: finalized, error: finalizeError } = await (admin as any).rpc('finalize_media_upload', {
      p_session_id: id,
      p_asset_id: assetId,
      p_bucket: getSpacesBucketName(),
      p_object_key: finalObjectKey,
      p_public_url: publicUrl,
      p_content_type: processed.contentType,
      p_byte_size: processed.buffer.byteLength,
      p_width: processed.width,
      p_height: processed.height,
      p_sha256: processedChecksum,
      p_idempotency_key: idempotencyKey,
    });
    if (finalizeError) throw new Error(`media_database_finalize_failed:${finalizeError.code ?? 'unknown'}`);

    await deleteSpaceObject(session.staging_key).catch((cleanupError) => {
      console.warn(JSON.stringify({ level: 'warn', message: 'media_staging_cleanup_deferred', requestId, error: safeFailureCode(cleanupError) }));
    });
    console.info(JSON.stringify({
      level: 'info',
      message: 'media_finalize_completed',
      requestId,
      purpose: session.entity_type,
      durationMs: Date.now() - startedAt,
    }));
    return Response.json({
      assetId,
      publicUrl,
      viewUrl: isPublic ? undefined : `/api/media/assets/${assetId}/view`,
      width: processed.width,
      height: processed.height,
      position: Number(finalized?.position ?? finalized?.[0]?.position ?? 0),
    }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    if (sessionId) {
      try {
        const admin = createAdminClient() as any;
        const { data: reconciled, error: reconcileError } = await admin
          .from('upload_sessions')
          .select('status,finalized_asset_id')
          .eq('id', sessionId)
          .maybeSingle();
        if (!reconcileError && reconciled?.status === 'ready') {
          const response = reconciled.finalized_asset_id
            ? await loadFinalizedMediaResponse(admin, reconciled.finalized_asset_id)
            : null;
          if (response) {
            console.warn(JSON.stringify({
              level: 'warn',
              message: 'media_finalize_response_recovered',
              requestId,
              durationMs: Date.now() - startedAt,
            }));
            return Response.json(response, { headers: { 'cache-control': 'private, no-store' } });
          }
          return Response.json({ error: 'media_finalize_state_ambiguous' }, { status: 503 });
        }
        if (reconcileError) {
          console.error(JSON.stringify({
            level: 'error',
            message: 'media_finalize_state_ambiguous',
            requestId,
          }));
          return Response.json({ error: 'media_finalize_state_ambiguous' }, { status: 503 });
        }
        if (finalObjectKey) await deleteSpaceObject(finalObjectKey).catch(() => undefined);
        await admin.from('upload_sessions').update({
          status: 'failed',
          failure_code: safeFailureCode(error),
        }).eq('id', sessionId).eq('status', 'processing');
      } catch {
        // Keep the deterministic final object when database state is unknown;
        // maintenance/retry can reconcile it without corrupting a committed asset.
        return Response.json({ error: 'media_finalize_state_ambiguous' }, { status: 503 });
      }
    } else if (finalObjectKey) {
      await deleteSpaceObject(finalObjectKey).catch(() => undefined);
    }
    console.error(JSON.stringify({
      level: 'error',
      message: safeFailureCode(error),
      requestId,
      durationMs: Date.now() - startedAt,
    }));
    if (error instanceof CommerceAccessError) {
      return Response.json({ error: error.code }, { status: error.status });
    }
    return Response.json({ error: safeFailureCode(error) }, { status: 422 });
  }
}
