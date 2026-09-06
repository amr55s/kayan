import { MarketplaceChatShell } from '@/components/marketplace/chat/chat-shell';
import { requireProfile } from '@/lib/auth/guards';
import { listConversations } from '@/lib/commerce/chat/service';

export const dynamic = 'force-dynamic';

export default async function DriverChatPage() {
  const profile = await requireProfile(['driver']);
  const inbox = await listConversations({ limit: 30 });
  return <MarketplaceChatShell initialInbox={inbox} initialConversation={null} currentUserId={profile.id} role="driver" basePath="/driver/marketplace/chat" />;
}
