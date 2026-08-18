import { NextResponse } from 'next/server';
import { claimMarketplaceGuestCart } from '@/lib/commerce/cart';
import { safeNextPath } from '@/lib/auth/safe-next';
import { logSafeServerFailure } from '@/lib/observability/server-log';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function destination(path: string): URL {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) throw new Error('site_url_missing');
  return new URL(path, siteUrl);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNextPath(url.searchParams.get('next'));
  if (!code) return NextResponse.redirect(destination('/signin?error=oauth_callback'));

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
    return NextResponse.redirect(destination(next));
  } catch {
    logSafeServerFailure('error', 'google_sign_in_callback_failed');
    return NextResponse.redirect(destination('/signin?error=profile_setup'));
  }
}
