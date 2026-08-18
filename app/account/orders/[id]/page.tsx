import { notFound, redirect } from 'next/navigation';
import { MarketplaceOrderDetailView } from '@/components/commerce-operations/order-detail';
import { getMyMarketplaceOrder, MarketplaceOperationsError } from '@/lib/commerce/operations';

export const dynamic = 'force-dynamic';

export default async function CustomerOrderDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  let order;
  try { order = await getMyMarketplaceOrder(id); }
  catch (error) {
    if (error instanceof MarketplaceOperationsError && error.code === 'authentication_required') redirect(`/signin?next=${encodeURIComponent(`/account/orders/${id}`)}`);
    throw error;
  }
  if (!order) notFound();
  return <main id="main-content"><MarketplaceOrderDetailView order={order} role="customer" returnTo={`/account/orders/${id}`} notice={query.notice} error={query.error} /></main>;
}
