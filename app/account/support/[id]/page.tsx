import { z } from 'zod';
import { notFound, redirect } from 'next/navigation';
import { getMyMarketplaceSupportThread, MarketplaceOperationsError } from '@/lib/commerce/operations';

export const dynamic = 'force-dynamic';

/** Legacy URL compatibility: authorize the old thread before entering unified chat. */
export default async function Page({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  try {
    const thread = await getMyMarketplaceSupportThread(id);
    if (!thread) notFound();
  } catch (error) {
    if (error instanceof MarketplaceOperationsError && error.code === 'authentication_required') {
      redirect(`/signin?next=${encodeURIComponent(`/account/support/${id}`)}`);
    }
    throw error;
  }
  redirect(`/account/chat/${id}`);
}
