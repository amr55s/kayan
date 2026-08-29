import { z } from 'zod';
import { notFound, redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth/guards';
import { getMyMarketplaceSupportThread } from '@/lib/commerce/operations';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }] = await Promise.all([params, requireProfile(['merchant'])]);
  if (!z.uuid().safeParse(id).success) notFound();
  const thread = await getMyMarketplaceSupportThread(id);
  if (!thread) notFound();
  redirect(`/merchant/marketplace/chat/${id}`);
}
