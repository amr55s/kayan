import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { processMarketplaceDeletionOutbox } from '@/lib/commerce/outbox-worker';
import { processCatalogImportImages } from '@/lib/commerce/catalog-image-worker';
import { processMarketplacePushJobs } from '@/lib/commerce/push-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const PRIVATE_NO_STORE = { 'cache-control': 'private, no-store' } as const;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization');
  if (!secret || !provided) return false;
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  if (!isAuthorized(request)) {
    console.warn(JSON.stringify({ level: 'warn', message: 'cron_unauthorized', requestId }));
    return Response.json({ error: 'unauthorized' }, {
      status: 401,
      headers: PRIVATE_NO_STORE,
    });
  }

  console.info(JSON.stringify({ level: 'info', message: 'maintenance_started', requestId }));
  try {
    const admin = createAdminClient();
    const [delivery, marketplace, legacyMedia, chatMedia, notifications] = await Promise.all([
      (admin as any).rpc('expire_delivery_offers'),
      (admin as any).rpc('run_marketplace_maintenance'),
      (admin as any).rpc('expire_legacy_media_uploads', { p_limit: 100 }),
      (admin as any).rpc('expire_marketplace_chat_attachments', { p_limit: 100 }),
      (admin as any).rpc('run_marketplace_notification_maintenance'),
    ]);
    if (delivery.error) throw new Error(`delivery_maintenance_failed:${delivery.error.code ?? 'unknown'}`);
    if (marketplace.error) throw new Error(`marketplace_maintenance_failed:${marketplace.error.code ?? 'unknown'}`);
    if (legacyMedia.error) throw new Error(`legacy_media_maintenance_failed:${legacyMedia.error.code ?? 'unknown'}`);
    if (chatMedia.error) throw new Error(`chat_media_maintenance_failed:${chatMedia.error.code ?? 'unknown'}`);
    if (notifications.error) throw new Error(`notification_maintenance_failed:${notifications.error.code ?? 'unknown'}`);
    const [outbox, catalogImages, push] = await Promise.all([
      processMarketplaceDeletionOutbox(15),
      // Daily Vercel Cron is a safe fallback. Production may invoke the
      // dedicated protected worker more frequently without changing this job.
      processCatalogImportImages(1),
      // Daily fallback only. Production should invoke the protected push
      // endpoint more frequently for timely delivery.
      processMarketplacePushJobs(10),
    ]);

    const durationMs = Date.now() - startedAt;
    console.info(JSON.stringify({ level: 'info', message: 'maintenance_completed', requestId, durationMs }));
    return Response.json({
      ok: true,
      deliveryExpired: delivery.data ?? 0,
      marketplace: marketplace.data ?? {},
      legacyMediaExpired: legacyMedia.data ?? 0,
      chatMediaExpired: chatMedia.data ?? 0,
      notifications: notifications.data ?? {},
      outbox,
      catalogImages,
      push,
      durationMs,
    }, {
      headers: PRIVATE_NO_STORE,
    });
  } catch {
    const durationMs = Date.now() - startedAt;
    // Raw database/validation messages may contain payload fields. Emit only a
    // stable event code; detailed diagnostics remain in server-side tracing.
    console.error(JSON.stringify({ level: 'error', message: 'maintenance_failed', requestId, durationMs }));
    return Response.json({ error: 'maintenance_failed', requestId }, {
      status: 500,
      headers: PRIVATE_NO_STORE,
    });
  }
}
