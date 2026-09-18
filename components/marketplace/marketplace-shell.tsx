import Link from 'next/link';
import type { ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { MarketplaceNav } from './marketplace-nav';
import type { MarketplaceNavigationItem } from './view-models';
import styles from './marketplace.module.css';

const defaultNavigation: MarketplaceNavigationItem[] = [
  { href: '/', label: 'ديرتك الرئيسية' },
  { href: '/marketplace', label: 'كل المنتجات' },
  { href: '/marketplace/cart', label: 'السلة' },
  { href: '/account/orders', label: 'طلباتي' },
  { href: '/account/notifications', label: 'الإشعارات' },
];

type MarketplaceShellProps = {
  children: ReactNode;
  navigation?: MarketplaceNavigationItem[];
  cartCount?: number;
};

function withCartBadge(
  items: MarketplaceNavigationItem[],
  cartCount: number | undefined,
): MarketplaceNavigationItem[] {
  if (typeof cartCount !== 'number') return items;
  return items.map((item) => (
    item.href === '/marketplace/cart' ? { ...item, badge: cartCount } : item
  ));
}

export function MarketplaceShell({
  children,
  navigation = defaultNavigation,
  cartCount,
}: MarketplaceShellProps) {
  const items = withCartBadge(navigation, cartCount);
  return (
    <div className={`dairtak-theme ${styles.shell}`}>
      <Header />

      <main id="main-content" className={styles.page}>
        <MarketplaceNav items={items} />
        {children}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Link href="/" className={styles.footerLink}>العودة إلى دليل ديرتك</Link>
          <span>الدفع عند الاستلام</span>
        </div>
      </footer>
    </div>
  );
}
