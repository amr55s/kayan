import { notFound } from 'next/navigation';
import { MarketplaceOrderDetailView } from '@/components/commerce-operations/order-detail';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import { getMyMarketplaceOrder } from '@/lib/commerce/operations';

export const dynamic = 'force-dynamic';

export default async function AdminMarketplaceOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  await requireMarketplaceAdminRole(['operations'], { nextPath: `/admin/marketplace/orders/${id}` });
  const order = await getMyMarketplaceOrder(id);
  if (!order) notFound();
  return <main id="main-content"><MarketplaceOrderDetailView order={order} role="admin" returnTo={`/admin/marketplace/orders/${id}`} notice={query.notice} error={query.error} /></main>;
}
