import { z } from 'zod';
import { notFound } from 'next/navigation';
import { MarketplaceChatShell } from '@/components/marketplace/chat/chat-shell';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import { getConversationPage, listConversations } from '@/lib/commerce/chat/service';

export const dynamic = 'force-dynamic';

export default async function AdminChatConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, access] = await Promise.all([params, requireMarketplaceAdminRole(['support'], { nextPath: '/admin/marketplace/chat' })]);
  const conversationId = z.uuid().safeParse(id);
  if (!conversationId.success) notFound();
  const [inbox, conversation] = await Promise.all([listConversations({ limit: 30 }), getConversationPage({ conversationId: conversationId.data, limit: 50 })]);
  return <MarketplaceChatShell initialInbox={inbox} initialConversation={conversation} currentUserId={access.profile.id} role="admin" basePath="/admin/marketplace/chat" />;
}
