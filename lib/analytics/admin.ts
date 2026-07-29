import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

type AnalyticsEventRow = {
  event_date: string;
  event_name: string;
  target_type: string;
  target_key: string;
  route: string;
  campaign_key?: string;
  events: number | string;
};

type AnalyticsVisitorRow = {
  event_date: string;
  visitor_hash: string;
};

export type BehaviorAnalyticsSummary = {
  available: boolean;
  periodDays: number;
  totalVisitors: number;
  visitorsToday: number;
  pageViews: number;
  placeOpens: number;
  driverOpens: number;
  actionClicks: number;
  searchUses: number;
  actionRate: number;
  daily: Array<{ date: string; views: number; visitors: number }>;
  topActions: Array<{ name: string; count: number }>;
  topPlaces: Array<{ placeId: string; opens: number; actions: number }>;
  topDrivers: Array<{ driverId: string; opens: number; actions: number }>;
  campaignEvents: Array<{
    campaignKey: string;
    visits: number;
    opens: number;
    actions: number;
    shares: number;
  }>;
};

const emptySummary: BehaviorAnalyticsSummary = {
  available: false,
  periodDays: 30,
  totalVisitors: 0,
  visitorsToday: 0,
  pageViews: 0,
  placeOpens: 0,
  driverOpens: 0,
  actionClicks: 0,
  searchUses: 0,
  actionRate: 0,
  daily: [],
  topActions: [],
  topPlaces: [],
  topDrivers: [],
  campaignEvents: [],
};

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function loadBehaviorAnalytics(): Promise<BehaviorAnalyticsSummary> {
  try {
    const admin = createAdminClient();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 29);
    const since = dateOnly(start);
    const today = dateOnly(new Date());
    const [eventResult, visitorResult] = await Promise.all([
      (admin as any)
        .from('analytics_daily_events')
        .select('event_date, event_name, target_type, target_key, route, campaign_key, events')
        .gte('event_date', since)
        .order('event_date', { ascending: true })
        .limit(5_000),
      (admin as any)
        .from('analytics_daily_visitors')
        .select('event_date, visitor_hash')
        .gte('event_date', since)
        .limit(25_000),
    ]);
    if (eventResult.error || visitorResult.error) {
      throw eventResult.error || visitorResult.error;
    }

    const events = (eventResult.data ?? []) as AnalyticsEventRow[];
    const visitors = (visitorResult.data ?? []) as AnalyticsVisitorRow[];
    const uniqueVisitors = new Set(visitors.map((row) => row.visitor_hash));
    const actionTotals = new Map<string, number>();
    const placeTotals = new Map<string, { opens: number; actions: number }>();
    const driverTotals = new Map<string, { opens: number; actions: number }>();
    const dailyViews = new Map<string, number>();
    const dailyVisitors = new Map<string, Set<string>>();
    const campaignTotals = new Map<string, {
      visits: number;
      opens: number;
      actions: number;
      shares: number;
    }>();
    let pageViews = 0;
    let placeOpens = 0;
    let driverOpens = 0;
    let actionClicks = 0;
    let searchUses = 0;

    for (const visitor of visitors) {
      const bucket = dailyVisitors.get(visitor.event_date) ?? new Set<string>();
      bucket.add(visitor.visitor_hash);
      dailyVisitors.set(visitor.event_date, bucket);
    }

    for (const event of events) {
      const count = Number(event.events) || 0;
      if (event.event_name === 'page_view') {
        pageViews += count;
        dailyViews.set(event.event_date, (dailyViews.get(event.event_date) ?? 0) + count);
      }
      if (event.event_name === 'place_open') placeOpens += count;
      if (event.event_name === 'driver_open') driverOpens += count;
      if (event.event_name === 'search_use') searchUses += count;
      if (![
        'page_view',
        'place_open',
        'driver_open',
        'guide_open',
        'search_use',
        'category_select',
      ].includes(event.event_name)) {
        actionClicks += count;
      }
      actionTotals.set(event.event_name, (actionTotals.get(event.event_name) ?? 0) + count);

      if (event.campaign_key) {
        const campaign = campaignTotals.get(event.campaign_key) ?? {
          visits: 0,
          opens: 0,
          actions: 0,
          shares: 0,
        };
        if (event.event_name === 'page_view') campaign.visits += count;
        if (event.event_name === 'place_open' || event.event_name === 'driver_open') {
          campaign.opens += count;
        }
        if (['phone_click', 'whatsapp_click', 'group_click', 'map_click'].includes(event.event_name)) {
          campaign.actions += count;
        }
        if (event.event_name === 'share_click' || event.event_name === 'marketing_share_click') {
          campaign.shares += count;
        }
        campaignTotals.set(event.campaign_key, campaign);
      }

      if (event.target_type === 'place' && event.target_key) {
        const place = placeTotals.get(event.target_key) ?? { opens: 0, actions: 0 };
        if (event.event_name === 'place_open') place.opens += count;
        else place.actions += count;
        placeTotals.set(event.target_key, place);
      }
      if (event.target_type === 'driver' && event.target_key) {
        const driver = driverTotals.get(event.target_key) ?? { opens: 0, actions: 0 };
        if (event.event_name === 'driver_open') driver.opens += count;
        else if (['phone_click', 'whatsapp_click', 'share_click'].includes(event.event_name)) {
          driver.actions += count;
        }
        driverTotals.set(event.target_key, driver);
      }
    }

    const daily = Array.from({ length: 14 }, (_, offset) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - (13 - offset));
      const key = dateOnly(date);
      return {
        date: key,
        views: dailyViews.get(key) ?? 0,
        visitors: dailyVisitors.get(key)?.size ?? 0,
      };
    });

    return {
      available: true,
      periodDays: 30,
      totalVisitors: uniqueVisitors.size,
      visitorsToday: dailyVisitors.get(today)?.size ?? 0,
      pageViews,
      placeOpens,
      driverOpens,
      actionClicks,
      searchUses,
      actionRate: placeOpens + driverOpens
        ? Math.min(100, Math.round((actionClicks / (placeOpens + driverOpens)) * 100))
        : 0,
      daily,
      topActions: Array.from(actionTotals, ([name, count]) => ({ name, count }))
        .filter((item) => item.name !== 'page_view')
        .sort((left, right) => right.count - left.count)
        .slice(0, 8),
      topPlaces: Array.from(placeTotals, ([placeId, totals]) => ({ placeId, ...totals }))
        .sort(
          (left, right) =>
            right.actions + right.opens - (left.actions + left.opens),
        )
        .slice(0, 8),
      topDrivers: Array.from(driverTotals, ([driverId, totals]) => ({ driverId, ...totals }))
        .sort(
          (left, right) =>
            right.actions + right.opens - (left.actions + left.opens),
        )
        .slice(0, 8),
      campaignEvents: Array.from(campaignTotals, ([campaignKey, totals]) => ({
        campaignKey,
        ...totals,
      })),
    };
  } catch (error) {
    console.warn('Behavior analytics are not available yet:', error);
    return emptySummary;
  }
}
