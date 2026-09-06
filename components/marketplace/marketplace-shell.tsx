import { Badge } from '@heroui/react/badge';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
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
};

export function MarketplaceShell({
  children,
  navigation = defaultNavigation,
}: MarketplaceShellProps) {
  return (
    <div className={`dairtak-theme ${styles.shell}`}>
      <Header />

      <main id="main-content" className={styles.page}>
        <nav className={styles.marketplaceNav} aria-label="أقسام المتجر">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className={styles.navLink}>
              <span>{item.label}</span>
              {typeof item.badge === 'number' && item.badge > 0 ? (
                <Badge.Root aria-label={`${item.badge} عناصر`}>
                  <Badge.Label className={styles.badge}>{item.badge}</Badge.Label>
                </Badge.Root>
              ) : null}
            </Link>
          ))}
        </nav>
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
