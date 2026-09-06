import { MarketplaceChatShell } from '@/components/marketplace/chat/chat-shell';
import { requireProfile } from '@/lib/auth/guards';
import { listConversations } from '@/lib/commerce/chat/service';

export const dynamic = 'force-dynamic';

export default async function MerchantChatPage() {
  const profile = await requireProfile(['merchant']);
  const inbox = await listConversations({ limit: 30 });
  return <MarketplaceChatShell initialInbox={inbox} initialConversation={null} currentUserId={profile.id} role="merchant" basePath="/merchant/marketplace/chat" />;
}
