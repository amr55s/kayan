import { MarketplaceChatShell } from '@/components/marketplace/chat/chat-shell';
import { requireAuthenticatedUser } from '@/lib/commerce/auth';
import { listConversations } from '@/lib/commerce/chat/service';

export const dynamic = 'force-dynamic';

export default async function CustomerChatPage() {
  const user = await requireAuthenticatedUser();
  const inbox = await listConversations({ limit: 30 });
  return <MarketplaceChatShell initialInbox={inbox} initialConversation={null} currentUserId={user.id} role="customer" basePath="/account/chat" />;
}
