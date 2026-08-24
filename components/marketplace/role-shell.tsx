import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type {
  MarketplaceNavigationItem,
  MarketplaceRole,
} from './view-models';
import styles from './marketplace.module.css';

const roleLabels: Record<MarketplaceRole, string> = {
  customer: 'حساب العميل',
  merchant: 'لوحة التاجر',
  admin: 'إدارة المنصة',
  driver: 'لوحة الكابتن',
};

type MarketplaceRoleShellProps = {
  role: MarketplaceRole;
  displayName: string;
  navigation: MarketplaceNavigationItem[];
  activeHref: string;
  children: ReactNode;
};

export function MarketplaceRoleShell({
  role,
  displayName,
  navigation,
  activeHref,
  children,
}: MarketplaceRoleShellProps) {
  return (
    <div className={styles.roleLayout}>
      <aside className={styles.roleSidebar} aria-label={roleLabels[role]}>
        <div className={styles.roleIdentity}>
          <span className={styles.roleName}>{displayName}</span>
          <Chip.Root size="sm">
            <Chip.Label className={styles.roleLabel}>{roleLabels[role]}</Chip.Label>
          </Chip.Root>
        </div>
        <nav className={styles.roleNav} aria-label="أقسام الحساب">
          {navigation.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
                {typeof item.badge === 'number' && item.badge > 0 ? (
                  <span className={styles.badge}>{item.badge}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </aside>

      <Card.Root className={styles.rolePanel}>
        <Card.Content className={styles.rolePanelContent}>{children}</Card.Content>
      </Card.Root>
    </div>
  );
}

export { roleLabels as marketplaceRoleLabels };
