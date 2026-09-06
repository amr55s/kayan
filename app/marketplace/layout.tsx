import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';

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

export default function MarketplaceLayout({ children }: { children: ReactNode }) {
  return <MarketplaceShell>{children}</MarketplaceShell>;
}
