'use server';

import { randomUUID } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath, type ChatLoginIntent } from '@/lib/auth/safe-next';
import { chatIntentCookie } from '@/lib/auth/chat-intent-cookie';
import { startGoogleOAuthFlow, type GoogleOAuthStartResult } from '@/lib/auth/oauth-flow';
import { logSafeServerFailure } from '@/lib/observability/server-log';
import { resolveOAuthSiteOrigin } from '@/lib/auth/oauth-origin';
import { checkGoogleProviderAvailability, googleProviderFeedback } from '@/lib/auth/google-provider';

type GoogleSignInInput = string | {
  next?: string;
  intent?: ChatLoginIntent | null;
};

function intentSecret(): string {
  const secret = process.env.MARKETPLACE_CHAT_INTENT_SECRET;
  if (!secret) throw new Error('chat_intent_configuration_invalid');
  return secret;
}

async function requestSiteOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host');
  return resolveOAuthSiteOrigin({
    environment: process.env.VERCEL_ENV,
    configuredSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    deploymentHost: process.env.VERCEL_URL,
    branchHost: process.env.VERCEL_BRANCH_URL,
    // Both headers are untrusted inputs; Preview accepts only an exact match
    // with a trusted platform hostname. No wildcard or forwarded-host fallback.
    requestOrigin: requestHeaders.get('origin') ?? (host ? `https://${host}` : null),
  });
}

/** Explicit account switching is separate from joining; no identities are linked. */
export async function switchToGoogleForOnboarding(): Promise<GoogleOAuthStartResult> {
  try {
    // Do not end the working legacy session if OAuth is not configured.
    intentSecret();
    await requestSiteOrigin();
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (user?.identities?.some((identity) => identity.provider === 'google')) {
      return { success: true, url: '/onboarding' };
    }
    const availability = await checkGoogleProviderAvailability();
    if (availability !== 'enabled') return googleProviderFeedback(availability);
    if (user) {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    }
    return beginGoogleSignIn('/onboarding');
  } catch (error) {
    logSafeServerFailure('warn', 'google_account_switch_failed', { failure: error });
    return { success: false, code: 'start_failed', message: 'تعذر تبديل الحساب إلى Google. حاول مرة أخرى.' };
  }
}

export async function beginGoogleSignIn(input?: GoogleSignInInput): Promise<
  GoogleOAuthStartResult
> {
  try {
    const supabase = await createClient();
    const next = typeof input === 'string' ? input : input?.next;
    const intent = typeof input === 'string' ? null : input?.intent ?? null;
    // Existing sessions can continue even when a new OAuth flow is unavailable.
    // Chat intents still use the signed flow below to preserve the destination.
    const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
    if (!sessionError && sessionData.user && !intent) {
      return { success: true, url: safeNextPath(next) };
    }
    const siteUrl = await requestSiteOrigin();
    if (sessionError || !sessionData.user) {
      const availability = await checkGoogleProviderAvailability();
      if (availability !== 'enabled') return googleProviderFeedback(availability);
    }
    const cookieStore = await cookies();
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
