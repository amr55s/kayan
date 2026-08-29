import { MarketplaceChatShell } from '@/components/marketplace/chat/chat-shell';
import { requireAdminAal2 } from '@/lib/auth/guards';
import { listConversations } from '@/lib/commerce/chat/service';

export const dynamic = 'force-dynamic';

export default async function AdminChatPage() {
  const profile = await requireAdminAal2({ capability: 'chat_monitor', nextPath: '/admin/marketplace/chat' });
  const inbox = await listConversations({ limit: 30 });
  return <MarketplaceChatShell initialInbox={inbox} initialConversation={null} currentUserId={profile.id} role="admin" basePath="/admin/marketplace/chat" />;
}
