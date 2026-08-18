import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { fetchSafeRemoteImage, UnsafeImageUrlError } from '@/lib/commerce/excel/image-fetch';
import { processImageForStorage } from '@/lib/images/server';
import {
  getPublicMediaUrl,
  getSpacesBucketName,
  writePublicMediaObject,
} from '@/lib/media/spaces';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
// A remote fetch (15s), image normalization and a Spaces write (25s) must all
// fit inside a 60s function invocation. Keep one bounded concurrency window so
// claimed leases are not left waiting behind earlier work in the same process.
const MAX_WORKER_BATCH = 2;
const MAX_CONCURRENCY = 2;
const LEASE_SECONDS = 180;
const MIN_LEASE_REMAINING_MS = 60_000;

type ImportImageClaim = {
  row_id: number;
  job_id: string;
  row_number: number;
  store_id: string;
  product_id: string;
  product_key: string;
  source_url: string;
  position: number;
  attempt: number;
  lease_expires_at: string;
};

export type CatalogImageWorkerSummary = {
  claimed: number;
  completed: number;
  retried: number;
  deadLettered: number;
  reportingFailed: number;
};

function assertClaim(value: unknown): ImportImageClaim {
  if (!value || typeof value !== 'object') throw new Error('invalid_worker_claim');
  const claim = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(claim.row_id) || Number(claim.row_id) < 1 ||
    !Number.isInteger(claim.row_number) || Number(claim.row_number) < 2 ||
    !UUID_PATTERN.test(String(claim.job_id ?? '')) ||
    !UUID_PATTERN.test(String(claim.store_id ?? '')) ||
    !UUID_PATTERN.test(String(claim.product_id ?? '')) ||
    typeof claim.product_key !== 'string' || claim.product_key.length === 0 || claim.product_key.length > 160 ||
    typeof claim.source_url !== 'string' || claim.source_url.length === 0 || claim.source_url.length > 2_048 ||
    !Number.isInteger(claim.position) || Number(claim.position) < 0 || Number(claim.position) > 9 ||
    !Number.isInteger(claim.attempt) || Number(claim.attempt) < 1 || Number(claim.attempt) > 5 ||
    typeof claim.lease_expires_at !== 'string' ||
    !Number.isFinite(Date.parse(claim.lease_expires_at))
  ) {
    throw new Error('invalid_worker_claim');
  }
  return claim as ImportImageClaim;
}

function safeFailure(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof UnsafeImageUrlError) {
    const permanentCodes = new Set([
      'invalid_url',
      'https_required',
      'credentials_forbidden',
      'port_forbidden',
      'fragment_forbidden',
      'blocked_host',
      'blocked_address',
      'image_too_large',
      'mime_type',
      'mime_mismatch',
      'redirect_limit',
      'redirect_location',
    ]);
    return {
      code: `remote_image_${error.code}`.slice(0, 160),
      retryable: !permanentCodes.has(error.code),
    };
  }
  const message = error instanceof Error ? error.message : '';
  if (
    message === 'invalid_image_dimensions' ||
    message === 'invalid_processed_image' ||
    /unsupported image|corrupt|Input buffer/iu.test(message)
  ) {
    return { code: 'remote_image_invalid_bytes', retryable: false };
  }
  if (message.startsWith('worker_claim_')) {
    return { code: message.slice(0, 160), retryable: true };
  }
  return { code: 'remote_image_processing_failed', retryable: true };
}

function checksum(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function processClaim(claim: ImportImageClaim, workerId: string) {
  if (Date.parse(claim.lease_expires_at) - Date.now() < MIN_LEASE_REMAINING_MS) {
    throw new Error('worker_claim_lease_expiring');
  }
  const fetched = await fetchSafeRemoteImage(claim.source_url, {
    maxBytes: 12 * 1024 * 1024,
    timeoutMs: 15_000,
  });
  const processed = await processImageForStorage(fetched.bytes, { alwaysReencode: true });
  const sha256 = checksum(processed.buffer);
  // Public objects are cached as immutable, so their key must change whenever
  // their bytes change. The row id preserves retry idempotency while the digest
  // prevents a delayed/stale worker from overwriting a newer cached object.
  const objectKey = `media/${claim.store_id}/product/${claim.product_id}/import-${claim.row_id}-${sha256.slice(0, 32)}.webp`;
  const publicUrl = getPublicMediaUrl(objectKey);

  await writePublicMediaObject({
    body: processed.buffer,
    checksumSha256: sha256,
    contentType: processed.contentType,
    objectKey,
  });

  const admin = createAdminClient() as any;
  const { error } = await admin.rpc('complete_catalog_import_image_job', {
    p_row_id: claim.row_id,
    p_worker_id: workerId,
    p_bucket: getSpacesBucketName(),
    p_object_key: objectKey,
    p_public_url: publicUrl,
    p_byte_size: processed.buffer.byteLength,
    p_sha256: sha256,
    p_width: processed.width,
    p_height: processed.height,
  });
  if (error) throw new Error(`worker_claim_complete_${error.code ?? 'unknown'}`);
}

async function reportFailure(claim: ImportImageClaim, workerId: string, error: unknown) {
  const failure = safeFailure(error);
  const admin = createAdminClient() as any;
  const { data, error: reportError } = await admin.rpc('fail_catalog_import_image_job', {
    p_row_id: claim.row_id,
    p_worker_id: workerId,
    p_error: failure.code,
    p_retryable: failure.retryable,
  });
  if (reportError) throw new Error(`worker_claim_failure_report_${reportError.code ?? 'unknown'}`);
  return String(data?.status ?? data?.[0]?.status ?? (failure.retryable ? 'retry' : 'dead_letter'));
}

/**
 * Processes a bounded batch so one invocation cannot monopolize function time or
 * memory. Database leases and deterministic object keys make retries crash-safe.
 */
export async function processCatalogImportImages(
  requestedLimit = 4,
): Promise<CatalogImageWorkerSummary> {
  const limit = Math.max(1, Math.min(MAX_WORKER_BATCH, Math.trunc(requestedLimit)));
  const workerId = randomUUID();
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc('claim_catalog_import_image_jobs', {
    p_limit: limit,
    p_worker_id: workerId,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (error) throw new Error(`worker_claim_failed_${error.code ?? 'unknown'}`);

  const claims = (Array.isArray(data) ? data : []).map(assertClaim);
  const summary: CatalogImageWorkerSummary = {
    claimed: claims.length,
    completed: 0,
    retried: 0,
    deadLettered: 0,
    reportingFailed: 0,
  };

  for (let offset = 0; offset < claims.length; offset += MAX_CONCURRENCY) {
    const window = claims.slice(offset, offset + MAX_CONCURRENCY);
    await Promise.all(window.map(async (claim) => {
      try {
        await processClaim(claim, workerId);
        summary.completed += 1;
      } catch (claimError) {
        try {
          const status = await reportFailure(claim, workerId, claimError);
          if (status === 'dead_letter') summary.deadLettered += 1;
          else summary.retried += 1;
        } catch {
          // The lease will expire and make the row eligible again. Never leak a
          // source URL or database error into logs or the HTTP response.
          summary.reportingFailed += 1;
        }
      }
    }));
  }

  return summary;
}
