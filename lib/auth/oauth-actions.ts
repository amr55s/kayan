'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import {
  parseChatLoginIntent,
  safeNextPath,
  type ChatLoginIntent,
} from '@/lib/auth/safe-next';
import { chatIntentCookie, signChatIntentCookie } from '@/lib/auth/chat-intent-cookie';
import { logSafeServerFailure } from '@/lib/observability/server-log';

type GoogleSignInInput = string | {
  next?: string;
  intent?: ChatLoginIntent | null;
};

function intentSecret(): string {
  const secret = process.env.MARKETPLACE_CHAT_INTENT_SECRET;
  if (!secret) throw new Error('chat_intent_configuration_invalid');
  return secret;
}

export async function beginGoogleSignIn(input?: GoogleSignInInput): Promise<
  { success: true; url: string } | { success: false; message: string }
> {
  try {
    const next = safeNextPath(typeof input === 'string' ? input : input?.next);
    const requestedIntent = typeof input === 'string' ? null : input?.intent ?? null;
    const intent = requestedIntent ? parseChatLoginIntent(requestedIntent) : null;
    if (requestedIntent && !intent) throw new Error('invalid_chat_intent');
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) throw new Error('site_url_missing');
    const callback = new URL('/auth/callback', siteUrl);
    callback.searchParams.set('next', next);
    const flowId = intent ? randomUUID() : null;
    if (flowId) callback.searchParams.set('flow', flowId);
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callback.toString(),
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error || !data.url) throw error || new Error('oauth_url_missing');
    if (intent && flowId) {
      const signed = signChatIntentCookie({
        secret: intentSecret(),
        flowId,
        returnTo: next,
        intent,
      });
      const cookieStore = await cookies();
      cookieStore.set(chatIntentCookie.name, signed.value, chatIntentCookie.options);
    }
    return { success: true, url: data.url };
  } catch (error) {
    logSafeServerFailure('error', 'google_sign_in_start_failed', { failure: error });
    return { success: false, message: 'تعذر بدء تسجيل الدخول بجوجل. حاول مرة أخرى.' };
  }
}
