import type { Metadata } from 'next';
import MarketplacePage from '@/app/marketplace/page';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'المتجر | دايرتك',
  description: 'منتجات من متاجر منطقتك مع طلب ودفع عند الاستلام من داخل الموقع.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'المتجر | دايرتك',
    description: 'منتجات من متاجر منطقتك مع طلب ودفع عند الاستلام من داخل الموقع.',
    url: '/',
    type: 'website',
  },
};

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <MarketplaceShell>
      <MarketplacePage searchParams={searchParams} />
    </MarketplaceShell>
  );
}
