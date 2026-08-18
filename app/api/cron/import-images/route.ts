import { timingSafeEqual } from 'node:crypto';
import { processCatalogImportImages } from '@/lib/commerce/catalog-image-worker';

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
  // Do not reflect an attacker-controlled request header into logs/responses.
  const requestId = crypto.randomUUID();
  if (!isAuthorized(request)) {
    console.warn(JSON.stringify({ level: 'warn', message: 'import_image_worker_unauthorized', requestId }));
    return Response.json({ error: 'unauthorized' }, {
      status: 401,
      headers: PRIVATE_NO_STORE,
    });
  }

  try {
    const result = await processCatalogImportImages(2);
    const durationMs = Date.now() - startedAt;
    console.info(JSON.stringify({
      level: 'info',
      message: 'import_image_worker_completed',
      requestId,
      durationMs,
      ...result,
    }));
    return Response.json({ ok: true, ...result, durationMs }, {
      headers: PRIVATE_NO_STORE,
    });
  } catch {
    const durationMs = Date.now() - startedAt;
    console.error(JSON.stringify({
      level: 'error',
      message: 'import_image_worker_failed',
      requestId,
      durationMs,
    }));
    return Response.json({ error: 'import_image_worker_failed', requestId }, {
      status: 500,
      headers: PRIVATE_NO_STORE,
    });
  }
}

// Vercel Cron invokes GET; Supabase pg_net can invoke the same protected worker
// with POST when a more frequent production schedule is configured.
export const POST = GET;
