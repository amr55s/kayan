import Link from 'next/link';
import type { ReactNode } from 'react';
import type { MarketplaceNavigationItem } from './view-models';
import styles from './marketplace.module.css';

const defaultNavigation: MarketplaceNavigationItem[] = [
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
          <Link href="/marketplace" className={styles.brand} aria-label="ديرتك — المتجر">
            <span className={styles.brandMark} aria-hidden="true">د</span>
            <span>ديرتك</span>
          </Link>
          <nav className={styles.primaryNav} aria-label="التنقل الرئيسي للمتجر">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className={styles.navLink}>
                {item.label}
                {typeof item.badge === 'number' && item.badge > 0 ? (
                  <span className={styles.badge} aria-label={`${item.badge} عناصر`}>
                    {item.badge}
                  </span>
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
          <span>تجربة شراء واضحة وآمنة داخل الموقع.</span>
          <span>الدفع عند الاستلام</span>
        </div>
      </footer>
    </div>
  );
}
