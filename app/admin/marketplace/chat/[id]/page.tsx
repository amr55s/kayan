import { z } from 'zod';
import { notFound } from 'next/navigation';
import { MarketplaceChatShell } from '@/components/marketplace/chat/chat-shell';
import { MonitorOpenAudit } from '@/components/marketplace/chat/monitor-open-audit';
import { requireAdminAal2 } from '@/lib/auth/guards';
import { getConversationPage, listConversations } from '@/lib/commerce/chat/service';

export const dynamic = 'force-dynamic';

export default async function AdminChatConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, profile] = await Promise.all([params, requireAdminAal2({ capability: 'chat_monitor', nextPath: '/admin/marketplace/chat' })]);
  const conversationId = z.uuid().safeParse(id);
  if (!conversationId.success) notFound();
  const [inbox, conversation] = await Promise.all([listConversations({ limit: 30 }), getConversationPage({ conversationId: conversationId.data, limit: 50 })]);
  return <><MonitorOpenAudit conversationId={conversationId.data} /><MarketplaceChatShell initialInbox={inbox} initialConversation={conversation} currentUserId={profile.id} role="admin" basePath="/admin/marketplace/chat" readOnly /></>;
}
