import { timingSafeEqual } from 'node:crypto';
import { loadBehaviorAnalytics } from '@/lib/analytics/admin';
import { autoPublishDailyPlan } from '@/lib/marketing/auto-publish';
import { SITE_URL } from '@/lib/marketing/content';
import { buildDailyPlan, cardQuery } from '@/lib/marketing/playbook';
import { logSafeServerFailure } from '@/lib/observability/server-log';
import { fetchHomePageData } from '@/lib/supabase/queries';

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

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  }
  const requestId = crypto.randomUUID();
  try {
    const [directory, analytics] = await Promise.all([
      fetchHomePageData(),
      loadBehaviorAnalytics(),
    ]);
    const plan = buildDailyPlan({
      date: new Date(),
      siteUrl: SITE_URL,
      places: directory.places,
      engagement: analytics.placeEngagement,
    });
    const imageUrl = new URL(`/api/marketing-card?${cardQuery(plan)}`, SITE_URL).toString();
    const channels = await autoPublishDailyPlan(plan, imageUrl);
    return Response.json({
      ok: true,
      date: plan.dateKey,
      theme: plan.theme.key,
      ref: plan.ref,
      channels,
    }, { headers: NO_STORE });
  } catch (error) {
    logSafeServerFailure('error', 'marketing_daily_failed', { failure: error, requestId });
    return Response.json({ error: 'marketing_daily_failed', requestId }, { status: 500, headers: NO_STORE });
  }
}
