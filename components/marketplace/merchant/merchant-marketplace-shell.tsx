import Link from 'next/link';
import type { ReactNode } from 'react';
import { Bell, Boxes, FileSpreadsheet, PackagePlus, Settings, ShoppingBag, Store, TicketPercent } from 'lucide-react';
import styles from './merchant-marketplace.module.css';

const navigation = [
  { href: '/merchant/marketplace', label: 'المنتجات', icon: Boxes },
  { href: '/merchant/marketplace/new', label: 'منتج جديد', icon: PackagePlus },
  { href: '/merchant/marketplace/orders', label: 'الطلبات', icon: ShoppingBag },
  { href: '/merchant/marketplace/excel', label: 'Excel', icon: FileSpreadsheet },
  { href: '/merchant/marketplace/coupons', label: 'الكوبونات', icon: TicketPercent },
  { href: '/merchant/marketplace/settings', label: 'إعداد المتجر', icon: Settings },
  { href: '/account/notifications', label: 'الإشعارات', icon: Bell },
] as const;

export function MerchantMarketplaceShell({
  children,
  displayName,
}: {
  children: ReactNode;
  displayName: string;
}) {
  return (
    <div className={styles.shell} dir="rtl">
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/merchant/marketplace" className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              <Store size={16} />
            </span>
            <span>كتالوج {displayName}</span>
          </Link>

          <nav className={styles.navigation} aria-label="إدارة كتالوج المتجر">
            {navigation.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={styles.navLink}>
                <Icon size={16} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>

          <Link href="/merchant" className={styles.backLink}>
            العودة لتشغيل الطلبات
          </Link>
        </div>
      </header>
      <main id="main-content" className={styles.content}>
        {children}
      </main>
    </div>
  );
}
