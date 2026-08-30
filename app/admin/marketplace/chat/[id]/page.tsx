import { z } from 'zod';
import { notFound } from 'next/navigation';
import { MarketplaceChatShell } from '@/components/marketplace/chat/chat-shell';
import { requireAdminAal2 } from '@/lib/auth/guards';
import { getMarketplaceChatAsMonitor, listChatMonitorQueue } from '@/lib/commerce/chat/service';

export const dynamic = 'force-dynamic';

export default async function AdminChatConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, profile] = await Promise.all([params, requireAdminAal2({ capability: 'chat_monitor', nextPath: '/admin/marketplace/chat' })]);
  const conversationId = z.uuid().safeParse(id);
  if (!conversationId.success) notFound();
  const [queue, conversation] = await Promise.all([listChatMonitorQueue(), getMarketplaceChatAsMonitor({ conversationId: conversationId.data, limit: 50 })]);
  const inbox = { items: queue.map((item) => ({ id: item.id, publicCode: item.public_code, kind: 'support' as const, status: item.status as 'open', subject: item.subject, store: null, order: null, counterpart: null, lastMessageAt: item.last_message_at, unreadCount: 0 })), nextCursor: null };
  return <MarketplaceChatShell initialInbox={inbox} initialConversation={conversation} currentUserId={profile.id} role="admin" basePath="/admin/marketplace/chat" readOnly />;
}
