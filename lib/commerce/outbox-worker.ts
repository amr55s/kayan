import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  deleteMediaObject,
  getPrivateMediaBucketName,
  getPublicMediaBucketName,
} from '@/lib/media/spaces';

const deletionTopics = [
  'media.staging_delete_requested',
  'media.finalized',
  'media.delete_requested',
  'catalog.import_file_delete_requested',
] as const;

const claimSchema = z.object({
  id: z.coerce.number().int().positive(),
  topic: z.enum(deletionTopics),
  payload: z.record(z.string(), z.unknown()),
  attempts: z.number().int().min(1).max(10),
});

function validateObjectKey(value: unknown, requiredPrefix?: string): string {
  if (
    typeof value !== 'string'
    || value.length < 3
    || value.length > 1_024
    || value.startsWith('/')
    || value.includes('\\')
    || value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
    || (requiredPrefix && !value.startsWith(requiredPrefix))
  ) {
    throw new Error('invalid_outbox_object_key');
  }
  return value;
}

function objectKeyFor(row: z.infer<typeof claimSchema>): string {
  if (row.topic === 'media.staging_delete_requested' || row.topic === 'media.finalized') {
    return validateObjectKey(row.payload.staging_key, 'staging/');
  }
  if (row.topic === 'media.delete_requested') {
    return validateObjectKey(row.payload.object_key, 'media/');
  }
  return validateObjectKey(row.payload.object_key);
}

function resolveBucket(payload: Record<string, unknown>): string {
  const privateBucket = getPrivateMediaBucketName();
  const publicBucket = getPublicMediaBucketName();
  if (payload.bucket == null) return privateBucket;
  if (payload.bucket !== privateBucket && payload.bucket !== publicBucket) {
    throw new Error('outbox_bucket_mismatch');
  }
  return payload.bucket;
}

function safeWorkerError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'outbox_worker_failed';
  return message.replace(/[^a-zA-Z0-9_.:-]/gu, '_').slice(0, 300) || 'outbox_worker_failed';
}

async function processClaim(admin: any, workerId: string, raw: unknown) {
  const row = claimSchema.parse(raw);
  try {
    await deleteMediaObject(objectKeyFor(row), resolveBucket(row.payload));
    const { data: completed, error } = await admin.rpc('complete_marketplace_outbox', {
      p_id: row.id,
      p_worker_id: workerId,
    });
    if (error || completed !== true) throw new Error(`outbox_complete_failed:${error?.code ?? 'unknown'}`);
    return { completed: 1, failed: 0, deadLettered: 0 };
  } catch (error) {
    const retryDelayMinutes = Math.min(360, 2 ** Math.min(row.attempts, 8));
    const retryAt = new Date(Date.now() + retryDelayMinutes * 60_000).toISOString();
    const { data: failed, error: failError } = await admin.rpc('fail_marketplace_outbox', {
      p_id: row.id,
      p_worker_id: workerId,
      p_error: safeWorkerError(error),
      p_retry_at: retryAt,
    });
    if (failError) throw new Error(`outbox_fail_record_failed:${failError.code ?? 'unknown'}`);
    return {
      completed: 0,
      failed: 1,
      deadLettered: failed?.dead_lettered === true ? 1 : 0,
    };
  }
}

export async function processMarketplaceDeletionOutbox(limit = 40) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const admin = createAdminClient() as any;
  const workerId = randomUUID();
  const { data, error } = await admin.rpc('claim_marketplace_outbox', {
    p_topics: [...deletionTopics],
    p_limit: safeLimit,
    p_worker_id: workerId,
  });
  if (error) throw new Error(`outbox_claim_failed:${error.code ?? 'unknown'}`);

  const claims = z.array(claimSchema).parse(data ?? []);
  const totals = { claimed: claims.length, completed: 0, failed: 0, deadLettered: 0 };
  for (let index = 0; index < claims.length; index += 5) {
    const results = await Promise.all(
      claims.slice(index, index + 5).map((row) => processClaim(admin, workerId, row)),
    );
    for (const result of results) {
      totals.completed += result.completed;
      totals.failed += result.failed;
      totals.deadLettered += result.deadLettered;
    }
  }
  return totals;
}
