import { NextResponse } from 'next/server';
import { sanitizeNextPath } from '@/lib/auth/safe-next';
import { claimMarketplaceGuestCart } from '@/lib/commerce/cart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = sanitizeNextPath(requestUrl.searchParams.get('next'), '/marketplace/cart');
  try {
    await claimMarketplaceGuestCart();
    return NextResponse.redirect(new URL(next, requestUrl.origin));
  } catch {
    const destination = new URL(next, requestUrl.origin);
    destination.searchParams.set('error', 'merge_deferred');
    return NextResponse.redirect(destination);
  }
}
