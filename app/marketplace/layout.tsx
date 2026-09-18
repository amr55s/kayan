import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { loadMarketplaceCart } from '@/lib/commerce/cart';

export const metadata: Metadata = {
  title: 'المتجر | ديرتك',
  description: 'منتجات من متاجر منطقتك مع طلب ودفع عند الاستلام من داخل الموقع.',
  alternates: { canonical: '/marketplace' },
  openGraph: {
    title: 'المتجر | ديرتك',
    description: 'منتجات من متاجر منطقتك مع طلب ودفع عند الاستلام من داخل الموقع.',
    url: '/marketplace',
    type: 'website',
  },
};

async function loadCartCount() {
  try {
    const result = await loadMarketplaceCart({ ignorePendingGuest: true });
    return result.model.itemCount;
  } catch {
    return 0;
  }
}

export default async function MarketplaceLayout({ children }: { children: ReactNode }) {
  const cartCount = await loadCartCount();
  return <MarketplaceShell cartCount={cartCount}>{children}</MarketplaceShell>;
}
