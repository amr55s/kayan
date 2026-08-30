import { z } from 'zod';
import { notFound } from 'next/navigation';
import { MarketplaceChatShell } from '@/components/marketplace/chat/chat-shell';
import { requireAuthenticatedUser } from '@/lib/commerce/auth';
import { canShareConversationLocation, getConversationPage, listConversations } from '@/lib/commerce/chat/service';

export const dynamic = 'force-dynamic';

export default async function CustomerChatConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireAuthenticatedUser()]);
  const conversationId = z.uuid().safeParse(id);
  if (!conversationId.success) notFound();
  const [inbox, conversation, canShareLocation] = await Promise.all([
    listConversations({ limit: 30 }),
    getConversationPage({ conversationId: conversationId.data, limit: 50 }),
    canShareConversationLocation(conversationId.data),
  ]);
  return <MarketplaceChatShell initialInbox={inbox} initialConversation={conversation} currentUserId={user.id} role="customer" basePath="/account/chat" canShareLocation={canShareLocation} />;
}
