'use server';

import { cookies } from 'next/headers';
import { chatIntentCookie } from '@/lib/auth/chat-intent-cookie';
import { parseChatLoginIntent, safeNextPath } from '@/lib/auth/safe-next';
import { retryRecoveredChatIntent } from '@/lib/auth/callback-flow';
import { claimMarketplaceGuestCart } from '@/lib/commerce/cart';
import { createClient } from '@/lib/supabase/server';
import { openMarketplaceConversationAction } from './actions';
import type { ChatActionState } from './contracts';

function field(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function retryMarketplaceConversationAction(
  _previous: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  const kind = field(formData, 'kind');
  const intent = parseChatLoginIntent(kind === 'presale'
    ? { kind, storeId: field(formData, 'storeId'), productId: field(formData, 'productId') }
    : { kind, orderId: field(formData, 'orderId') });
  const rawReturnTo = field(formData, 'returnTo');
  if (!intent || !rawReturnTo || safeNextPath(rawReturnTo) !== rawReturnTo) {
    return { status: 'error', code: 'invalid_input' };
  }
  const secret = process.env.MARKETPLACE_CHAT_INTENT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    return { status: 'error', code: 'service_unavailable' };
  }
  const cookieStore = await cookies();
  const supabase = await createClient();
  return retryRecoveredChatIntent({ intent, returnTo: rawReturnTo }, {
    secret,
    now: Date.now,
    readCookie: () => cookieStore.get(chatIntentCookie.name)?.value,
    deleteCookie: () => { cookieStore.delete(chatIntentCookie.name); },
    prepareCustomer: async () => {
      const { data, error } = await (supabase as any).rpc('ensure_marketplace_customer');
      if (error || !data) throw error || new Error('customer_profile_missing');
    },
    claimGuestCart: claimMarketplaceGuestCart,
    openConversation: () => openMarketplaceConversationAction({ status: 'idle' }, formData),
  });
}
