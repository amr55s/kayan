import { NextResponse } from 'next/server';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import { createWalletTopupProofUrlAsAdmin } from '@/lib/commerce/wallet';

export const dynamic = 'force-dynamic';

/** Sends a finance admin to a two-minute signed link for one transfer screenshot. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireMarketplaceAdminRole(['finance'], { failureMode: 'throw' });
  } catch {
    return new NextResponse('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } });
  }
  let url: string | null = null;
  try {
    url = await createWalletTopupProofUrlAsAdmin(id);
  } catch {
    url = null;
  }
  if (!url) return new NextResponse('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  return NextResponse.redirect(url, { status: 302, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
