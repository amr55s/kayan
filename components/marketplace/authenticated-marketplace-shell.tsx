'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { MarketplaceShell } from './marketplace-shell';
import { MarketplaceRoleShell } from './role-shell';
import type { MarketplaceNavigationItem, MarketplaceRole } from './view-models';

const roleNavigation: Record<MarketplaceRole, MarketplaceNavigationItem[]> = {
  customer: [
    { href: '/account/orders', label: 'طلباتي' },
    { href: '/account/notifications', label: 'الإشعارات' },
    { href: '/account/chat', label: 'الرسائل' },
  ],
  merchant: [
    { href: '/merchant/marketplace', label: 'المنتجات' },
    { href: '/merchant/marketplace/new', label: 'منتج جديد' },
    { href: '/merchant/marketplace/orders', label: 'الطلبات' },
    { href: '/merchant/marketplace/excel', label: 'Excel' },
    { href: '/merchant/marketplace/coupons', label: 'الكوبونات' },
    { href: '/merchant/marketplace/settings', label: 'إعداد المتجر' },
    { href: '/account/notifications', label: 'الإشعارات' },
    { href: '/merchant', label: 'تشغيل الطلبات' },
    { href: '/merchant/marketplace/chat', label: 'الرسائل' },
  ],
  driver: [
    { href: '/driver', label: 'تشغيل الطلبات' },
    { href: '/driver/marketplace/chat', label: 'الرسائل' },
  ],
  admin: [
    { href: '/admin', label: 'إدارة المنصة' },
    { href: '/admin/marketplace/chat', label: 'مراقبة الرسائل' },
  ],
};

function activeNavigationHref(pathname: string, navigation: MarketplaceNavigationItem[]): string {
  return [...navigation]
    .sort((left, right) => right.href.length - left.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.href
    ?? navigation[0]?.href
    ?? '/';
}

export function AuthenticatedMarketplaceShell({
  children,
  role,
  displayName,
}: {
  children: ReactNode;
  role: MarketplaceRole;
  displayName: string;
}) {
  const pathname = usePathname();
  const navigation = roleNavigation[role];
  const activeHref = activeNavigationHref(pathname, navigation);

  return (
    <MarketplaceShell>
      <MarketplaceRoleShell
        role={role}
        displayName={displayName}
        navigation={navigation}
        activeHref={activeHref}
      >
        {children}
      </MarketplaceRoleShell>
    </MarketplaceShell>
  );
}
