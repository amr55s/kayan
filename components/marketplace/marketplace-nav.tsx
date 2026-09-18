'use client';

import { Badge } from '@heroui/react/badge';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MarketplaceNavigationItem } from './view-models';
import styles from './marketplace.module.css';

function navItemIsActive(pathname: string, href: string) {
  if (href === '/marketplace') {
    return pathname === '/marketplace' || pathname.startsWith('/marketplace/products/');
  }
  if (href === '/marketplace/cart') {
    return pathname === '/marketplace/cart'
      || pathname.startsWith('/marketplace/cart/')
      || pathname.startsWith('/marketplace/checkout');
  }
  if (href === '/account/orders') {
    return pathname.startsWith('/account/orders') || pathname.startsWith('/marketplace/orders/');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MarketplaceNav({ items }: { items: MarketplaceNavigationItem[] }) {
  const pathname = usePathname();

  return (
    <nav className={styles.marketplaceNav} aria-label="أقسام المتجر">
      {items.map((item) => {
        const active = navItemIsActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span>{item.label}</span>
            {typeof item.badge === 'number' && item.badge > 0 ? (
              <Badge.Root aria-label={`${item.badge} عناصر`}>
                <Badge.Label className={styles.badge}>{item.badge}</Badge.Label>
              </Badge.Root>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
