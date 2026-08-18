import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getCurrentProfile, requireAdminAal2 } from '@/lib/auth/guards';
import { processImageForStorage } from '@/lib/images/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  deleteSpaceObject,
  getPublicMediaUrl,
  getSpacesBucketName,
  headSpaceObject,
  readSpaceObject,
  writePublicMediaObject,
} from '@/lib/media/spaces';
import { enqueueSpacesDeletion, legacyUploadToken } from '@/lib/media/legacy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/iu),
}).strict();

type LegacyUploadRow = {
  id: string;
  owner_id: string;
  purpose: 'place';
  staging_key: string;
  expected_content_type: string;
  expected_size_bytes: number;
  expected_sha256: string;
  status: string;
  expires_at: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || profile.must_change_password) {
    return Response.json({ error: 'authentication_required' }, { status: 401 });
  }
  if (profile.role === 'admin') {
    try {
      await requireAdminAal2({ failureMode: 'throw' });
    } catch {
      return Response.json({ error: 'admin_mfa_required' }, { status: 403 });
    }
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !parsedBody.success) {
    return Response.json({ error: 'invalid_finalize_request' }, { status: 400 });
  }

  const uploadId = parsedParams.data.id;
  const admin = createAdminClient() as any;
  let finalObjectKey: string | null = null;
  let bucket: string | undefined;
  let stagingKey: string | null = null;
  let finalized = false;

  try {
    const { data: existing, error: lookupError } = await admin
      .from('legacy_media_uploads')
      .select('id, owner_id, purpose, staging_key, expected_content_type, expected_size_bytes, expected_sha256, status, expires_at')
      .eq('id', uploadId)
      .eq('owner_id', profile.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) return Response.json({ error: 'upload_not_found' }, { status: 404 });
    const row = existing as LegacyUploadRow;
    stagingKey = row.staging_key;
    if (row.purpose !== 'place') {
      return Response.json({ error: 'upload_purpose_mismatch' }, { status: 409 });
    }
    if (row.status === 'ready') {
      return Response.json({ token: legacyUploadToken(row.id) }, {
        headers: { 'cache-control': 'private, no-store' },
      });
    }
    if (
      row.status !== 'staging'
      || new Date(row.expires_at).getTime() <= Date.now()
      || parsedBody.data.checksumSha256.toLowerCase() !== row.expected_sha256
    ) {
      return Response.json({ error: 'upload_not_finalizable' }, { status: 409 });
    }

    const { data: claimed, error: claimError } = await admin
      .from('legacy_media_uploads')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('owner_id', profile.id)
      .eq('status', 'staging')
      .select('id')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return Response.json({ error: 'upload_finalize_conflict' }, { status: 409 });

    const head = await headSpaceObject(row.staging_key);
    const sourceLength = Number(head.ContentLength ?? 0);
    const sourceType = String(head.ContentType ?? '').split(';', 1)[0].trim().toLowerCase();
    const metadataHash = String(head.Metadata?.sha256 ?? '').toLowerCase();
    if (
      sourceLength !== Number(row.expected_size_bytes)
      || sourceType !== row.expected_content_type
      || metadataHash !== row.expected_sha256
    ) {
      throw new Error('staged_media_metadata_mismatch');
    }

    const source = await readSpaceObject(row.staging_key, Number(row.expected_size_bytes));
    const sourceHash = createHash('sha256').update(source).digest('hex');
    if (source.byteLength !== Number(row.expected_size_bytes) || sourceHash !== row.expected_sha256) {
      throw new Error('staged_media_checksum_mismatch');
    }

    const processed = await processImageForStorage(source, { alwaysReencode: true });
    const processedHash = createHash('sha256').update(processed.buffer).digest('hex');
    const assetId = row.id;
    finalObjectKey = `media/legacy/place/pending/${assetId}.webp`;
    bucket = getSpacesBucketName();
    await writePublicMediaObject({
      body: processed.buffer,
      checksumSha256: processedHash,
      contentType: processed.contentType,
      objectKey: finalObjectKey,
    });
    const publicUrl = getPublicMediaUrl(finalObjectKey);

    const { data: completed, error: completeError } = await admin
      .from('legacy_media_uploads')
      .update({
        status: 'ready',
        asset_id: assetId,
        bucket,
        object_key: finalObjectKey,
        public_url: publicUrl,
        content_type: processed.contentType,
        byte_size: processed.buffer.byteLength,
        width: processed.width,
        height: processed.height,
        sha256: processedHash,
        expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('owner_id', profile.id)
      .eq('status', 'processing')
      .select('id')
      .maybeSingle();
    if (completeError || !completed) throw completeError ?? new Error('upload_finalize_contract_failed');
    finalized = true;

    try {
      await deleteSpaceObject(row.staging_key);
    } catch {
      await enqueueSpacesDeletion({
        eventKey: `legacy.stage.finalized:${row.id}`,
        objectKey: row.staging_key,
        staging: true,
        aggregateId: row.id,
        aggregateType: 'place',
        bucket,
      }).catch(() => undefined);
    }

    return Response.json({ token: legacyUploadToken(row.id) }, {
      status: 201,
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch {
    if (finalized) {
      return Response.json({ token: legacyUploadToken(uploadId) }, {
        headers: { 'cache-control': 'private, no-store' },
      });
    }
    await admin.from('legacy_media_uploads').update({
      status: 'failed',
      failure_code: 'media_finalize_failed',
      updated_at: new Date().toISOString(),
    }).eq('id', uploadId).eq('owner_id', profile.id).eq('status', 'processing');

    const cleanup = [] as Promise<unknown>[];
    if (stagingKey) cleanup.push(enqueueSpacesDeletion({
      eventKey: `legacy.stage.failed:${uploadId}`,
      objectKey: stagingKey,
      staging: true,
      aggregateId: uploadId,
      aggregateType: 'place',
      bucket,
    }));
    if (finalObjectKey) cleanup.push(enqueueSpacesDeletion({
      eventKey: `legacy.media.failed:${uploadId}`,
      objectKey: finalObjectKey,
      aggregateId: uploadId,
      aggregateType: 'place',
      bucket,
    }));
    await Promise.allSettled(cleanup);
    return Response.json({ error: 'media_finalize_failed' }, { status: 422 });
  }
}
