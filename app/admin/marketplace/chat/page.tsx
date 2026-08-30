import { MarketplaceChatAdminMonitor } from '@/components/marketplace/chat/admin-monitor';
import { z } from 'zod';
import { requireAdminAal2 } from '@/lib/auth/guards';
import { listChatMonitorQueue } from '@/lib/commerce/chat/service';
import { moderateMarketplaceChatAction } from './actions';

export const dynamic = 'force-dynamic';

const filterSchema = z.object({ role: z.enum(['customer','merchant','driver','admin']).optional(), status: z.enum(['open','waiting_customer','waiting_support','resolved','closed','paused']).optional(), storeId: z.uuid().optional(), orderId: z.uuid().optional(), driverId: z.uuid().optional() }).strict();

export default async function AdminChatPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireAdminAal2({ capability: 'chat_monitor', nextPath: '/admin/marketplace/chat' });
  void profile;
  const raw = await searchParams;
  const filters = filterSchema.safeParse(Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]).filter(([, value]) => value)));
  const queue = await listChatMonitorQueue(filters.success ? filters.data : {});
  return <MarketplaceChatAdminMonitor items={queue} moderate={moderateMarketplaceChatAction} />;
}
