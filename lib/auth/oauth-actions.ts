'use server';

import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/auth/safe-next';
import { logSafeServerFailure } from '@/lib/observability/server-log';

export async function beginGoogleSignIn(next?: string): Promise<
  { success: true; url: string } | { success: false; message: string }
> {
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) throw new Error('site_url_missing');
    const callback = new URL('/auth/callback', siteUrl);
    callback.searchParams.set('next', safeNextPath(next));
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
    return { success: true, url: data.url };
  } catch (error) {
    logSafeServerFailure('error', 'google_sign_in_start_failed', { failure: error });
    return { success: false, message: 'تعذر بدء تسجيل الدخول بجوجل. حاول مرة أخرى.' };
  }
}
