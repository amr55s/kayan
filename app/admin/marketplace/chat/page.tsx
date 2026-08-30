import { MarketplaceChatAdminMonitor } from '@/components/marketplace/chat/admin-monitor';
import { requireAdminAal2 } from '@/lib/auth/guards';
import { listChatMonitorQueue } from '@/lib/commerce/chat/service';
import { moderateMarketplaceChatAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminChatPage() {
  const profile = await requireAdminAal2({ capability: 'chat_monitor', nextPath: '/admin/marketplace/chat' });
  void profile;
  const queue = await listChatMonitorQueue();
  return <MarketplaceChatAdminMonitor items={queue} moderate={moderateMarketplaceChatAction} />;
}
