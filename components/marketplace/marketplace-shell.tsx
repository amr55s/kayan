import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
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
  /** A promise streams the badge in, so the cart lookup never delays the page. */
  cartCount?: number | Promise<number>;
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

async function NavWithCartBadge({
  navigation,
  cartCount,
}: {
  navigation: MarketplaceNavigationItem[];
  cartCount: number | Promise<number>;
}) {
  return <MarketplaceNav items={withCartBadge(navigation, await cartCount)} />;
}

export function MarketplaceShell({
  children,
  navigation = defaultNavigation,
  cartCount,
}: MarketplaceShellProps) {
  return (
    <div className={`dairtak-theme ${styles.shell}`}>
      <Header />

      <main id="main-content" className={styles.page}>
        {cartCount === undefined ? (
          <MarketplaceNav items={navigation} />
        ) : (
          <Suspense fallback={<MarketplaceNav items={navigation} />}>
            <NavWithCartBadge navigation={navigation} cartCount={cartCount} />
          </Suspense>
        )}
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
