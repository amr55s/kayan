import { z } from 'zod';
import { notFound, redirect } from 'next/navigation';
import { requireAdminAal2 } from '@/lib/auth/guards';
import { ChatServiceError, getConversationPage } from '@/lib/commerce/chat/service';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }] = await Promise.all([params, requireAdminAal2({ capability: 'chat_monitor', nextPath: '/admin/marketplace/chat' })]);
  if (!z.uuid().safeParse(id).success) notFound();
  // The unified read RPC recognizes the durable monitor capability while the
  // legacy reply RPC deliberately does not grant monitors authoring rights.
  try {
    const page = await getConversationPage({ conversationId: id, limit: 1 });
    if (page.conversation.kind !== 'support') notFound();
  } catch (error) {
    if (error instanceof ChatServiceError && ['not_found', 'authentication_required'].includes(error.code)) notFound();
    throw error;
  }
  redirect(`/admin/marketplace/chat/${id}`);
}
