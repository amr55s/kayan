import { notFound } from 'next/navigation';
import { MarketplaceOrderDetailView } from '@/components/commerce-operations/order-detail';
import { requireProfile } from '@/lib/auth/guards';
import { getMyMarketplaceOrder } from '@/lib/commerce/operations';

export const dynamic = 'force-dynamic';

export default async function DriverMarketplaceOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  await requireProfile(['driver']);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const order = await getMyMarketplaceOrder(id);
  if (!order) notFound();
  return <main id="main-content"><MarketplaceOrderDetailView order={order} role="driver" returnTo={`/driver/marketplace/${id}`} notice={query.notice} error={query.error} /></main>;
}
