import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { claimMarketplaceGuestCart } from '@/lib/commerce/cart';
import { openMarketplaceConversationAction } from '@/lib/commerce/chat/actions';
import type { ChatLoginIntent } from '@/lib/auth/safe-next';
import { chatIntentCookie } from '@/lib/auth/chat-intent-cookie';
import { handleGoogleOAuthCallback } from '@/lib/auth/callback-flow';
import { logSafeServerFailure } from '@/lib/observability/server-log';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function intentSecret(): string {
  const secret = process.env.MARKETPLACE_CHAT_INTENT_SECRET;
  if (!secret) throw new Error('chat_intent_configuration_invalid');
  return secret;
}

function intentForm(intent: ChatLoginIntent): FormData {
  const form = new FormData();
  form.set('kind', intent.kind);
  form.set('chatRoute', '/account/chat');
  if (intent.kind === 'presale') {
    form.set('storeId', intent.storeId);
    if (intent.productId) form.set('productId', intent.productId);
  } else {
    form.set('orderId', intent.orderId);
  }
  return form;
}

export async function GET(request: Request) {
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) throw new Error('site_url_missing');
    const cookieStore = await cookies();
    const supabase = await createClient();
    const result = await handleGoogleOAuthCallback({ requestUrl: request.url }, {
      siteUrl,
      secret: intentSecret(),
      now: Date.now,
      readCookie: () => cookieStore.get(chatIntentCookie.name)?.value,
      writeCookie: (value) => { cookieStore.set(chatIntentCookie.name, value, chatIntentCookie.options); },
      deleteCookie: () => { cookieStore.delete(chatIntentCookie.name); },
      exchangeCode: async (code) => {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      },
      ensureCustomer: async () => {
        const { data, error } = await (supabase as any).rpc('ensure_marketplace_customer');
        if (error || !data) throw error || new Error('customer_profile_missing');
      },
      claimGuestCart: claimMarketplaceGuestCart,
      openConversation: (intent) => openMarketplaceConversationAction(
        { status: 'idle' },
        intentForm(intent),
      ),
    });
    if (result.event === 'chat_open_failed') {
      logSafeServerFailure('warn', 'chat_intent_open_failed');
    } else if (result.event === 'callback_failed') {
      logSafeServerFailure('error', 'google_sign_in_callback_failed');
    }
    return NextResponse.redirect(result.redirectTo);
  } catch (error) {
    logSafeServerFailure('error', 'google_sign_in_callback_failed', { failure: error });
    return NextResponse.json(
      { error: 'authentication_unavailable' },
      { status: 503 },
    );
  }
}
