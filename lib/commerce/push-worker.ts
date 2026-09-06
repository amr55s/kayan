import 'server-only';

import { randomUUID } from 'node:crypto';
import webPush from 'web-push';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAllowedPushEndpoint } from '@/lib/commerce/push-validation';

const MAX_BATCH = 25;
const MAX_CONCURRENCY = 5;
const claimSchema = z.object({
  id: z.coerce.number().int().positive(),
  endpoint: z.string().url().max(2048).refine(isAllowedPushEndpoint),
  p256dh: z.string().regex(/^[A-Za-z0-9_-]{40,255}$/u),
  auth: z.string().regex(/^[A-Za-z0-9_-]{12,128}$/u),
  notification_type: z.string().regex(/^[a-z][a-z0-9_.-]{1,79}$/u),
  href: z.string().regex(/^\/(account|merchant|admin|driver)(\/|$)/u).max(500),
  attempts: z.number().int().min(1).max(5),
});

type PushFailureCode =
  | 'expired_subscription'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'invalid_subscription'
  | 'configuration_error'
  | 'send_failed';

export type PushWorkerSummary = {
  claimed: number;
  completed: number;
  retried: number;
  deadLettered: number;
  reportingFailed: number;
};

function configureVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || publicKey.length < 40 || !privateKey || privateKey.length < 20 || !subject) {
    throw new Error('push_configuration_missing');
  }
  let parsed: URL;
  try { parsed = new URL(subject); } catch { throw new Error('push_configuration_invalid'); }
  if (!['https:', 'mailto:'].includes(parsed.protocol)) throw new Error('push_configuration_invalid');
  webPush.setVapidDetails(subject, publicKey, privateKey);
}

function failureCode(error: unknown): PushFailureCode {
  const statusCode = error && typeof error === 'object' && 'statusCode' in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : 0;
  if (statusCode === 404 || statusCode === 410) return 'expired_subscription';
  if (statusCode === 400 || statusCode === 401 || statusCode === 403) return 'invalid_subscription';
  if (statusCode === 429) return 'rate_limited';
  if (statusCode >= 500 && statusCode <= 599) return 'provider_unavailable';
  if (error instanceof z.ZodError) return 'invalid_subscription';
  if (error instanceof Error && error.message.startsWith('push_configuration_')) return 'configuration_error';
  return 'send_failed';
}

async function sendClaim(admin: any, workerId: string, raw: unknown) {
  let claim: z.infer<typeof claimSchema>;
  try {
    claim = claimSchema.parse(raw);
  } catch (error) {
    const id = raw && typeof raw === 'object' && 'id' in raw ? Number((raw as { id: unknown }).id) : 0;
    if (Number.isSafeInteger(id) && id > 0) {
      const { data, error: reportError } = await admin.rpc('fail_marketplace_push_job', {
        p_id: id,
        p_worker_id: workerId,
        p_failure_code: failureCode(error),
      });
      if (reportError || data !== true) {
        return { completed: 0, retried: 0, deadLettered: 0, reportingFailed: 1 };
      }
    }
    return { completed: 0, retried: 0, deadLettered: 1, reportingFailed: 0 };
  }

  try {
    await webPush.sendNotification({
      endpoint: claim.endpoint,
      keys: { p256dh: claim.p256dh, auth: claim.auth },
    }, JSON.stringify({
      title: 'ديرتك',
      body: 'لديك تحديث جديد داخل ديرتك.',
      url: claim.href,
      tag: claim.notification_type,
    }), {
      TTL: 60 * 60 * 6,
      urgency: 'normal',
      timeout: 10_000,
    });
    const { data, error } = await admin.rpc('complete_marketplace_push_job', {
      p_id: claim.id,
      p_worker_id: workerId,
    });
    if (error || data !== true) throw new Error('push_completion_failed');
    return { completed: 1, retried: 0, deadLettered: 0, reportingFailed: 0 };
  } catch (error) {
    const code = failureCode(error);
    const { data, error: reportError } = await admin.rpc('fail_marketplace_push_job', {
      p_id: claim.id,
      p_worker_id: workerId,
      p_failure_code: code,
    });
    if (reportError || data !== true) {
      return { completed: 0, retried: 0, deadLettered: 0, reportingFailed: 1 };
    }
    const deadLettered = code === 'expired_subscription'
      || code === 'invalid_subscription'
      || code === 'configuration_error'
      || claim.attempts >= 5;
    return {
      completed: 0,
      retried: deadLettered ? 0 : 1,
      deadLettered: deadLettered ? 1 : 0,
      reportingFailed: 0,
    };
  }
}

export async function processMarketplacePushJobs(requestedLimit = 20): Promise<PushWorkerSummary> {
  configureVapid();
  const limit = Math.max(1, Math.min(MAX_BATCH, Math.trunc(requestedLimit)));
  const workerId = randomUUID();
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc('claim_marketplace_push_jobs', {
    p_limit: limit,
    p_worker_id: workerId,
  });
  if (error) throw new Error(`push_claim_failed:${error.code ?? 'unknown'}`);
  const claims = Array.isArray(data) ? data : [];
  const summary: PushWorkerSummary = {
    claimed: claims.length,
    completed: 0,
    retried: 0,
    deadLettered: 0,
    reportingFailed: 0,
  };
  for (let offset = 0; offset < claims.length; offset += MAX_CONCURRENCY) {
    const results = await Promise.all(
      claims.slice(offset, offset + MAX_CONCURRENCY).map((claim) => sendClaim(admin, workerId, claim)),
    );
    for (const result of results) {
      summary.completed += result.completed;
      summary.retried += result.retried;
      summary.deadLettered += result.deadLettered;
      summary.reportingFailed += result.reportingFailed;
    }
  }
  return summary;
}
