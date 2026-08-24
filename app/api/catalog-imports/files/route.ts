import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PRODUCT_WORKBOOK_LIMITS } from '@/lib/commerce/excel';
import { MerchantCatalogError, resolveMerchantStore } from '@/lib/commerce/merchant-products';
import { requireServerEnv } from '@/lib/env/server';
import { createPrivateStageUpload, getPrivateMediaBucketName } from '@/lib/media/spaces';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const requestSchema = z.object({
  storeId: z.uuid(),
  byteSize: z.number().int().min(1).max(PRODUCT_WORKBOOK_LIMITS.maxFileBytes),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: 'invalid_import_file' }, { status: 400 });
    const context = await resolveMerchantStore(parsed.data.storeId);
    if (!context || context.storeId !== parsed.data.storeId) {
      return Response.json({ error: 'catalog_access_required' }, { status: 403 });
    }
    const { data: { user }, error: userError } = await context.supabase.auth.getUser();
    if (userError || !user) return Response.json({ error: 'authentication_required' }, { status: 401 });
    const requestKey = createHash('sha256')
      .update(`catalog-import-file:${user.id}:${requireServerEnv('CLIENT_ERROR_HASH_SALT')}`)
      .digest('hex');
    const { data: allowed, error: rateError } = await (createAdminClient() as any).rpc(
      'consume_public_submission_rate_limit',
      { p_request_key: requestKey, p_limit: 20 },
    );
    if (rateError) throw new MerchantCatalogError('service_unavailable');
    if (!allowed) {
      return Response.json({ error: 'catalog_import_rate_limited' }, {
        status: 429,
        headers: { 'cache-control': 'private, no-store', 'retry-after': '3600' },
      });
    }
    const fileId = randomUUID();
    const objectKey = `imports/${context.storeId}/${fileId}.xlsx`;
    const { error: metadataError } = await (context.supabase as any).rpc('create_my_catalog_import_file', {
      p_store_id: context.storeId,
      p_file_id: fileId,
      p_bucket: getPrivateMediaBucketName(),
      p_object_key: objectKey,
      p_byte_size: parsed.data.byteSize,
      p_sha256: parsed.data.checksumSha256,
    });
    if (metadataError) throw new MerchantCatalogError('service_unavailable');
    let signed: Awaited<ReturnType<typeof createPrivateStageUpload>>;
    try {
      signed = await createPrivateStageUpload({
        checksumSha256: parsed.data.checksumSha256,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        objectKey,
        sizeBytes: parsed.data.byteSize,
      });
    } catch (error) {
      await (context.supabase as any).rpc('discard_my_catalog_import_file', {
        p_file_id: fileId,
        p_reason: 'presign_failed',
      });
      throw error;
    }
    return Response.json({ fileId, ...signed }, {
      status: 201,
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch (error) {
    const status = error instanceof MerchantCatalogError && error.code === 'access_denied' ? 401 : 503;
    return Response.json({ error: 'catalog_import_upload_unavailable' }, {
      status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

const discardSchema = z.object({ storeId: z.uuid(), fileId: z.uuid() }).strict();

export async function DELETE(request: Request) {
  try {
    const parsed = discardSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: 'invalid_import_file' }, { status: 400 });
    const context = await resolveMerchantStore(parsed.data.storeId);
    if (!context || context.storeId !== parsed.data.storeId) {
      return Response.json({ error: 'catalog_access_required' }, { status: 403 });
    }
    const { error } = await (context.supabase as any).rpc('discard_my_catalog_import_file', {
      p_file_id: parsed.data.fileId,
      p_reason: 'upload_abandoned',
    });
    if (error) throw new MerchantCatalogError('service_unavailable');
    return new Response(null, { status: 204, headers: { 'cache-control': 'private, no-store' } });
  } catch {
    return Response.json({ error: 'catalog_import_discard_unavailable' }, {
      status: 503,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
