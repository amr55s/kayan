import { z } from 'zod';
import { notFound } from 'next/navigation';
import { MarketplaceChatShell } from '@/components/marketplace/chat/chat-shell';
import { requireProfile } from '@/lib/auth/guards';
import { canShareConversationLocation, getConversationPage, listConversations } from '@/lib/commerce/chat/service';

export const dynamic = 'force-dynamic';

export default async function DriverChatConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, profile] = await Promise.all([params, requireProfile(['driver'])]);
  const conversationId = z.uuid().safeParse(id);
  if (!conversationId.success) notFound();
  const [inbox, conversation, canShareLocation] = await Promise.all([listConversations({ limit: 30 }), getConversationPage({ conversationId: conversationId.data, limit: 50 }), canShareConversationLocation(conversationId.data)]);
  return <MarketplaceChatShell initialInbox={inbox} initialConversation={conversation} currentUserId={profile.id} role="driver" basePath="/driver/marketplace/chat" canShareLocation={canShareLocation} />;
}
