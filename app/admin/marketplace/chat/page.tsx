import { MarketplaceChatAdminMonitor } from '@/components/marketplace/chat/admin-monitor';
import { requireAdminAal2 } from '@/lib/auth/guards';
import { parseMonitorSearchFilters } from '@/lib/commerce/chat/monitor-filters';
import { listChatMonitorQueue } from '@/lib/commerce/chat/service';
import { moderateMarketplaceChatAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminChatPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireAdminAal2({ capability: 'chat_monitor', nextPath: '/admin/marketplace/chat' });
  void profile;
  const filters = parseMonitorSearchFilters(await searchParams);
  const queue = await listChatMonitorQueue(filters);
  return <MarketplaceChatAdminMonitor items={queue} filters={filters} moderate={moderateMarketplaceChatAction} />;
}
