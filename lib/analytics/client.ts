'use client';

export type SiteAnalyticsEvent =
  | 'page_view'
  | 'place_open'
  | 'phone_click'
  | 'whatsapp_click'
  | 'group_click'
  | 'telegram_click'
  | 'map_click'
  | 'share_click'
  | 'favorite_click'
  | 'upvote_click'
  | 'search_use'
  | 'category_select'
  | 'join_open'
  | 'feedback_open'
  | 'add_listing_open'
  | 'driver_signup_open'
  | 'support_click';

type AnalyticsTarget =
  | { targetType: 'site'; targetKey?: never }
  | { targetType: 'place'; targetKey: string }
  | { targetType: 'category'; targetKey: string }
  | { targetType: 'feature'; targetKey: string };

const VISITOR_KEY = 'kayan_analytics_visitor_v1';
const recentEvents = new Map<string, number>();
let memoryVisitorId = '';

function makeVisitorId(): string {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  } catch {
    return `${Date.now().toString(16).slice(-8).padStart(8, '0')}-0000-4000-8000-${Math.random()
      .toString(16)
      .slice(2, 14)
      .padEnd(12, '0')}`;
  }
}

function getVisitorId(): string {
  if (memoryVisitorId) return memoryVisitorId;
  try {
    const stored = window.localStorage.getItem(VISITOR_KEY);
    if (stored) {
      memoryVisitorId = stored;
      return stored;
    }
  } catch {
    // Restricted storage falls back to an in-memory identifier.
  }

  memoryVisitorId = makeVisitorId();
  try {
    window.localStorage.setItem(VISITOR_KEY, memoryVisitorId);
  } catch {
    // Analytics is optional and never blocks browsing.
  }
  return memoryVisitorId;
}

export function trackSiteEvent(
  eventName: SiteAnalyticsEvent,
  target: AnalyticsTarget = { targetType: 'site' },
): void {
  if (typeof window === 'undefined') return;

  const signature = `${eventName}:${target.targetType}:${target.targetKey ?? ''}`;
  const now = Date.now();
  if (now - (recentEvents.get(signature) ?? 0) < 700) return;
  recentEvents.set(signature, now);

  const payload = JSON.stringify({
    visitorId: getVisitorId(),
    eventName,
    targetType: target.targetType,
    targetKey: target.targetKey ?? '',
    route: window.location.pathname,
  });

  void fetch('/api/analytics-events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
    cache: 'no-store',
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => {
    // Telemetry must fail silently.
  });
}
