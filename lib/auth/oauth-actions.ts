'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { ChatLoginIntent } from '@/lib/auth/safe-next';
import { chatIntentCookie } from '@/lib/auth/chat-intent-cookie';
import { startGoogleOAuthFlow, type GoogleOAuthStartResult } from '@/lib/auth/oauth-flow';
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
  GoogleOAuthStartResult
> {
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) throw new Error('site_url_missing');
    const cookieStore = await cookies();
    const supabase = await createClient();
    const result = await startGoogleOAuthFlow({
      next: typeof input === 'string' ? input : input?.next,
      intent: typeof input === 'string' ? null : input?.intent ?? null,
    }, {
      secret: intentSecret(),
      siteUrl,
      now: Date.now,
      randomFlowId: randomUUID,
      readCookie: () => cookieStore.get(chatIntentCookie.name)?.value,
      writeCookie: (value) => { cookieStore.set(chatIntentCookie.name, value, chatIntentCookie.options); },
      deleteCookie: () => { cookieStore.delete(chatIntentCookie.name); },
      isAuthenticated: async () => {
        const { data } = await supabase.auth.getUser();
        return Boolean(data.user);
      },
      startOAuth: async (redirectTo) => {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
            queryParams: { prompt: 'select_account' },
          },
        });
        if (error || !data.url) throw error || new Error('oauth_url_missing');
        return data.url;
      },
    });
    if (!result.success && result.code === 'start_failed') {
      logSafeServerFailure('error', 'google_sign_in_start_failed');
    }
    return result;
  } catch (error) {
    logSafeServerFailure('error', 'google_sign_in_start_failed', { failure: error });
    return { success: false, code: 'start_failed', message: 'تعذر بدء تسجيل الدخول بجوجل. حاول مرة أخرى.' };
  }
}
