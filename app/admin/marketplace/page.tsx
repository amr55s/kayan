import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AdminMarketplaceIndexPage() {
  redirect('/admin/marketplace/orders');
}
