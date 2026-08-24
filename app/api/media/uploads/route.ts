import { createHash, randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  CommerceAccessError,
  requireDeliveryProofAccess,
  requireMerchantEntity,
} from '@/lib/commerce/auth';
import {
  createMediaUploadSchema,
  MEDIA_EXTENSION,
  MEDIA_SESSION_TTL_MINUTES,
} from '@/lib/media/contracts';
import { createPrivateStageUpload } from '@/lib/media/spaces';
import { requireServerEnv } from '@/lib/env/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

function errorResponse(error: unknown) {
  if (error instanceof CommerceAccessError) {
    return Response.json({ error: error.code }, { status: error.status });
  }
  return Response.json({ error: 'media_upload_preparation_failed' }, { status: 500 });
}

function safeFailureCode(error: unknown): string {
  if (error instanceof CommerceAccessError) return error.code;
  if (error instanceof Error && /^[a-z0-9_]+(?::[a-z0-9_]+)?$/u.test(error.message)) {
    return error.message.slice(0, 120);
  }
  return 'media_upload_preparation_failed';
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get('x-vercel-id') || crypto.randomUUID();
  try {
    const parsed = createMediaUploadSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: 'invalid_media_upload' }, { status: 400 });
    const input = parsed.data;
    const access = input.purpose === 'delivery_proof'
      ? await requireDeliveryProofAccess(input.entityId)
      : await requireMerchantEntity({
          entityId: input.entityId,
          merchantId: input.merchantId!,
          purpose: input.purpose,
        });
    const { user, storeId } = access;
    const merchantId = access.merchantId;
    const admin = createAdminClient();

    const requestKey = createHash('sha256')
      .update(`marketplace-media:${user.id}:${requireServerEnv('CLIENT_ERROR_HASH_SALT')}`)
      .digest('hex');
    const { data: allowed, error: rateError } = await (admin as any).rpc(
      'consume_public_submission_rate_limit',
      { p_request_key: requestKey, p_limit: 50 },
    );
    if (rateError) throw new Error(`upload_rate_check_failed:${rateError.code ?? 'unknown'}`);
    if (!allowed) {
      return Response.json({ error: 'media_upload_rate_limited' }, { status: 429 });
    }

    const sessionId = randomUUID();
    const extension = MEDIA_EXTENSION[input.contentType];
    const objectKey = `staging/${merchantId}/${input.purpose}/${input.entityId}/${input.slot}/${sessionId}.${extension}`;
    let expiresAt = new Date(Date.now() + MEDIA_SESSION_TTL_MINUTES * 60_000).toISOString();
    if (input.purpose === 'delivery_proof') {
      const supabase = await createClient();
      const { data: session, error: sessionError } = await (supabase as any).rpc(
        'create_my_delivery_proof_upload_session',
        {
          p_order_id: input.entityId,
          p_session_id: sessionId,
          p_staging_key: objectKey,
          p_expected_content_type: input.contentType,
          p_expected_size_bytes: input.sizeBytes,
          p_expected_sha256: input.checksumSha256,
        },
      );
      if (
        sessionError
        || session?.session_id !== sessionId
        || session?.staging_key !== objectKey
        || typeof session?.expires_at !== 'string'
      ) {
        throw new Error(`upload_session_insert_failed:${sessionError?.code ?? 'contract'}`);
      }
      expiresAt = session.expires_at;
    } else {
      const { error: insertError } = await (admin as any).from('upload_sessions').insert({
        id: sessionId,
        owner_id: user.id,
        merchant_id: merchantId,
        store_id: storeId,
        entity_type: input.purpose,
        entity_id: input.entityId,
        slot: input.slot,
        staging_key: objectKey,
        expected_content_type: input.contentType,
        expected_size_bytes: input.sizeBytes,
        expected_sha256: input.checksumSha256,
        status: 'staging',
        expires_at: expiresAt,
      });
      if (insertError) throw new Error(`upload_session_insert_failed:${insertError.code ?? 'unknown'}`);
    }

    try {
      const signed = await createPrivateStageUpload({
        checksumSha256: input.checksumSha256,
        contentType: input.contentType,
        objectKey,
        sizeBytes: input.sizeBytes,
      });
      console.info(JSON.stringify({
        level: 'info',
        message: 'media_upload_prepared',
        requestId,
        purpose: input.purpose,
        durationMs: Date.now() - startedAt,
      }));
      return Response.json({ sessionId, expiresAt, ...signed }, {
        status: 201,
        headers: { 'cache-control': 'private, no-store' },
      });
    } catch (error) {
      await (admin as any).from('upload_sessions').update({
        status: 'failed',
        failure_code: 'storage_presign_failed',
      }).eq('id', sessionId);
      throw error;
    }
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'media_upload_preparation_failed',
      code: safeFailureCode(error),
      requestId,
      durationMs: Date.now() - startedAt,
    }));
    return errorResponse(error);
  }
}
