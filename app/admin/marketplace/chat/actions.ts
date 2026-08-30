'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminAal2 } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';

const moderation = z.object({
  conversationId: z.uuid(), action: z.enum(['warn', 'pause', 'close', 'reopen', 'review', 'escalate_dispute']),
  reason: z.string().trim().min(5).max(500),
}).strict();

export async function moderateMarketplaceChatAction(formData: FormData): Promise<void> {
  await requireAdminAal2({ capability: 'chat_monitor', failureMode: 'throw' });
  const input = moderation.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  // @ts-expect-error Task 10 RPC is locally committed before generated types refresh.
  const { error } = await supabase.rpc('moderate_marketplace_chat', {
    p_thread_id: input.conversationId, p_action: input.action, p_reason: input.reason, p_monitor_session_id: null,
  });
  if (error) throw new Error('chat_moderation_failed');
  revalidatePath('/admin/marketplace/chat');
  revalidatePath(`/admin/marketplace/chat/${input.conversationId}`);
}
