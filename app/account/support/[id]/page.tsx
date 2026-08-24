import { notFound, redirect } from 'next/navigation';
import { SupportThreadView } from '@/components/commerce-operations/support-thread';
import {
  getMyMarketplaceSupportThread,
  MarketplaceOperationsError,
  type MarketplaceSupportMessageCursor,
} from '@/lib/commerce/operations';

export const dynamic = 'force-dynamic';

function supportCursor(params: Record<string, string | string[] | undefined>): MarketplaceSupportMessageCursor | null {
  return typeof params.before === 'string' && typeof params.message === 'string'
    ? { createdAt: params.before, id: params.message }
    : null;
}

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const cursor = supportCursor(query);
  let thread;
  try {
    thread = await getMyMarketplaceSupportThread(id, { cursor });
  } catch (error) {
    if (error instanceof MarketplaceOperationsError && error.code === 'authentication_required') {
      redirect('/signin?next=%2Faccount%2Forders');
    }
    throw error;
  }
  if (!thread) notFound();
  return <><span id="main-content" tabIndex={-1} /><SupportThreadView thread={thread} returnTo={`/account/support/${id}`} viewingHistory={Boolean(cursor)} /></>;
}
