import { notFound } from 'next/navigation';
import { SupportThreadView } from '@/components/commerce-operations/support-thread';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import { getMyMarketplaceSupportThread, type MarketplaceSupportMessageCursor } from '@/lib/commerce/operations';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  await requireMarketplaceAdminRole(['support'], { nextPath: `/admin/marketplace/support/${id}` });
  const cursor: MarketplaceSupportMessageCursor | null =
    typeof query.before === 'string' && typeof query.message === 'string'
      ? { createdAt: query.before, id: query.message }
      : null;
  const thread = await getMyMarketplaceSupportThread(id, { cursor });
  if (!thread) notFound();
  return <><span id="main-content" tabIndex={-1} /><SupportThreadView thread={thread} returnTo={`/admin/marketplace/support/${id}`} viewingHistory={Boolean(cursor)} /></>;
}
