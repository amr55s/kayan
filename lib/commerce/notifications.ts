import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type MarketplaceNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: { href?: string };
  read_at: string | null;
  created_at: string;
};

export type MarketplaceNotificationPage = {
  items: MarketplaceNotification[];
  next_cursor: { created_at: string; id: string } | null;
};

export class MarketplaceNotificationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'MarketplaceNotificationError';
  }
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code ?? 'notification_request_failed');
    if (/^[A-Za-z0-9_.-]{1,80}$/u.test(code)) return code;
  }
  return 'notification_request_failed';
}

export async function listMyMarketplaceNotifications(
  limit = 30,
  cursor?: { createdAt: string; id: string },
): Promise<MarketplaceNotificationPage> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc('list_my_marketplace_notifications', {
    p_limit: limit,
    p_before_created_at: cursor?.createdAt ?? null,
    p_before_id: cursor?.id ?? null,
  });
  if (error) throw new MarketplaceNotificationError(errorCode(error));
  const page = data as MarketplaceNotificationPage | null;
  return {
    items: Array.isArray(page?.items) ? page.items : [],
    next_cursor: page?.next_cursor ?? null,
  };
}

export async function countMyUnreadMarketplaceNotifications(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc('count_my_unread_marketplace_notifications');
  if (error) throw new MarketplaceNotificationError(errorCode(error));
  return Number.isSafeInteger(data) && data >= 0 ? data : 0;
}

export async function markMyMarketplaceNotificationRead(id: string): Promise<boolean> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) {
    throw new MarketplaceNotificationError('invalid_notification_id');
  }
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc('mark_my_marketplace_notification_read', {
    p_notification_id: id,
  });
  if (error) throw new MarketplaceNotificationError(errorCode(error));
  return data === true;
}

export async function markAllMyMarketplaceNotificationsRead(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc('mark_all_my_marketplace_notifications_read');
  if (error) throw new MarketplaceNotificationError(errorCode(error));
  return Number.isSafeInteger(data) && data >= 0 ? data : 0;
}
