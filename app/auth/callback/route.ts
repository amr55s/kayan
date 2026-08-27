import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { claimMarketplaceGuestCart } from '@/lib/commerce/cart';
import { openMarketplaceConversationAction } from '@/lib/commerce/chat/actions';
import {
  createChatLoginHref,
  safeNextPath,
  type ChatLoginIntent,
} from '@/lib/auth/safe-next';
import { chatIntentCookie, verifyChatIntentCookie } from '@/lib/auth/chat-intent-cookie';
import { logSafeServerFailure } from '@/lib/observability/server-log';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function destination(path: string): URL {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) throw new Error('site_url_missing');
  return new URL(path, siteUrl);
}

function intentSecret(): string {
  const secret = process.env.MARKETPLACE_CHAT_INTENT_SECRET;
  if (!secret) throw new Error('chat_intent_configuration_invalid');
  return secret;
}

async function callbackIntent(
  flowId: string | null,
  returnTo: string,
): Promise<{ intent: ChatLoginIntent; cookieStore: Awaited<ReturnType<typeof cookies>> } | null> {
  if (!flowId) return null;
  const cookieStore = await cookies();
  try {
    const verified = verifyChatIntentCookie(cookieStore.get(chatIntentCookie.name)?.value, {
      secret: intentSecret(),
      flowId,
      returnTo,
    });
    return verified.status === 'valid' ? { intent: verified.intent, cookieStore } : null;
  } catch {
    logSafeServerFailure('error', 'chat_intent_verification_failed');
    return null;
  }
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

function retryDestination(
  returnTo: string,
  pendingIntent: Awaited<ReturnType<typeof callbackIntent>>,
  error: 'oauth_callback' | 'profile_setup',
): URL {
  const retryPath = pendingIntent
    ? createChatLoginHref({ returnTo, intent: pendingIntent.intent })
    : `/signin?next=${encodeURIComponent(returnTo)}`;
  const retry = destination(retryPath);
  retry.searchParams.set('error', error);
  return retry;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNextPath(url.searchParams.get('next'));
  const flowId = url.searchParams.get('flow');
  const pendingIntent = await callbackIntent(flowId, next);
  if (!code) {
    return NextResponse.redirect(retryDestination(next, pendingIntent, 'oauth_callback'));
  }

  try {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;

    const { data: customer, error: profileError } = await (supabase as any).rpc(
      'ensure_marketplace_customer',
    );
    if (profileError || !customer) throw profileError || new Error('customer_profile_missing');

    // Claiming is best-effort here and remains lazy/idempotent in the cart
    // resolver. A temporary failure must not turn a valid OAuth login into an
    // authentication error or leak the guest credential into logs.
    await claimMarketplaceGuestCart().catch(() => undefined);
    if (pendingIntent) {
      const result = await openMarketplaceConversationAction(
        { status: 'idle' },
        intentForm(pendingIntent.intent),
      );
      pendingIntent.cookieStore.delete(chatIntentCookie.name);
      if (result.status === 'error') {
        logSafeServerFailure('warn', 'chat_intent_open_failed');
      }
    }
    return NextResponse.redirect(destination(next));
  } catch {
    logSafeServerFailure('error', 'google_sign_in_callback_failed');
    return NextResponse.redirect(retryDestination(next, pendingIntent, 'profile_setup'));
  }
}
