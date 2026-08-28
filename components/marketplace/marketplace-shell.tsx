import { Badge } from '@heroui/react/badge';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/layout/BrandLogo';
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
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="DAIRTAK — العودة إلى الصفحة الرئيسية">
            <BrandLogo variant="full" className={styles.brandLogo} priority />
          </Link>
          <nav className={styles.primaryNav} aria-label="التنقل الرئيسي للمتجر">
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
        </div>
      </header>

      <main id="main-content" className={styles.page}>
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
