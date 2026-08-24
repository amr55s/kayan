import { notFound } from 'next/navigation';
import { SupportThreadView } from '@/components/commerce-operations/support-thread';
import { requireProfile } from '@/lib/auth/guards';
import { getMyMarketplaceSupportThread, type MarketplaceSupportMessageCursor } from '@/lib/commerce/operations';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireProfile(['merchant']);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const cursor: MarketplaceSupportMessageCursor | null =
    typeof query.before === 'string' && typeof query.message === 'string'
      ? { createdAt: query.before, id: query.message }
      : null;
  const thread = await getMyMarketplaceSupportThread(id, { cursor });
  if (!thread) notFound();
  return <SupportThreadView thread={thread} returnTo={`/merchant/marketplace/support/${id}`} viewingHistory={Boolean(cursor)} />;
}
