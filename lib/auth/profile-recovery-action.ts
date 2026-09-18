'use server';

import { cookies } from 'next/headers';
import { chatIntentCookie } from '@/lib/auth/chat-intent-cookie';
import { retryRecoveredProfileFlow } from '@/lib/auth/callback-flow';
import { safeNextPath } from '@/lib/auth/safe-next';
import { claimMarketplaceGuestCart } from '@/lib/commerce/cart';
import type { ChatActionState } from '@/lib/commerce/chat/contracts';
import { createClient } from '@/lib/supabase/server';
import { ensureMarketplaceCustomerProfile } from '@/lib/commerce/ensure-customer';

export async function retryGoogleProfileRecoveryAction(
  _previous: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  const rawReturnTo = formData.get('returnTo');
  if (typeof rawReturnTo !== 'string' || safeNextPath(rawReturnTo) !== rawReturnTo) {
    return { status: 'error', code: 'invalid_input' };
  }
  const secret = process.env.MARKETPLACE_CHAT_INTENT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    return { status: 'error', code: 'service_unavailable' };
  }
  const cookieStore = await cookies();
  const supabase = await createClient();
  return retryRecoveredProfileFlow({ returnTo: rawReturnTo }, {
    secret,
    now: Date.now,
    readCookie: () => cookieStore.get(chatIntentCookie.name)?.value,
    deleteCookie: () => { cookieStore.delete(chatIntentCookie.name); },
    prepareCustomer: () => ensureMarketplaceCustomerProfile(supabase as never),
    claimGuestCart: claimMarketplaceGuestCart,
  });
}
