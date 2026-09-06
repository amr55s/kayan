import { timingSafeEqual } from 'node:crypto';
import { processMarketplacePushJobs } from '@/lib/commerce/push-worker';
import { logSafeServerFailure } from '@/lib/observability/server-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const NO_STORE = { 'cache-control': 'private, no-store' } as const;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const value = request.headers.get('authorization');
  if (!secret || secret.length < 32 || !value) return false;
  const actual = Buffer.from(value);
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

async function run(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  }
  const requestId = crypto.randomUUID();
  try {
    const summary = await processMarketplacePushJobs(25);
    return Response.json({ ok: true, summary }, { headers: NO_STORE });
  } catch (error) {
    logSafeServerFailure('error', 'push_worker_failed', { failure: error, requestId });
    return Response.json({ error: 'push_worker_failed', requestId }, { status: 500, headers: NO_STORE });
  }
}

export const GET = run;
export const POST = run;
