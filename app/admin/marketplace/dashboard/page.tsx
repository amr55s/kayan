import Link from 'next/link';
import { MarketplaceAdminDashboardView } from '@/components/admin/marketplace-dashboard';
import styles from '@/components/admin/marketplace-dashboard.module.css';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import {
  getMarketplaceAdminDashboard,
  listDuplicateMerchantSignalsAsAdmin,
  WalletError,
} from '@/lib/commerce/wallet';

export const dynamic = 'force-dynamic';

const PERIODS = new Set([7, 30, 90]);

export default async function AdminMarketplaceDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { roles } = await requireMarketplaceAdminRole(
    ['operations', 'support', 'finance', 'catalog_reviewer'],
    { nextPath: '/admin/marketplace/dashboard' },
  );
  const requested = Number.parseInt((await searchParams).days ?? '', 10);
  const days = PERIODS.has(requested) ? requested : 30;
  const superAdmin = roles.includes('super_admin');
  const canFinance = superAdmin || roles.includes('finance');

  const links = [
    { href: '/admin/marketplace/orders', label: 'الطلبات والمراجعات' },
    ...(canFinance ? [{ href: '/admin/marketplace/wallets', label: 'المحافظ والرسوم' }] : []),
    { href: '/admin/marketplace/chat', label: 'مراقبة الرسائل' },
    ...(superAdmin ? [
      { href: '/admin/marketplace/setup', label: 'مناطق التوصيل والكوبونات' },
      { href: '/admin/marketplace/memberships', label: 'صلاحيات الإدارة' },
    ] : []),
    { href: '/admin', label: 'دليل ديرتك والحسابات' },
  ];

  let data;
  try {
    data = await getMarketplaceAdminDashboard(days);
  } catch (error) {
    const missing = error instanceof WalletError && error.code === 'schema_unavailable';
    return (
      <main id="main-content" className={styles.page}>
        <header className={styles.header}><div><p className={styles.eyebrow}>إدارة المنصة</p><h1 className={styles.title}>لوحة متابعة السوق</h1></div></header>
        <p role="alert" className={styles.warning}>
          {missing
            ? 'قاعدة البيانات لم تُحدَّث بعد إلى نسخة المحفظة ولوحة المتابعة. طبّق آخر migration ثم أعد فتح الصفحة.'
            : 'تعذر تحميل بيانات اللوحة الآن. حاول مرة أخرى بعد قليل.'}
        </p>
        <nav className={styles.links}>{links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}</nav>
      </main>
    );
  }
  // The duplicate check is an alert, not the page: a failure must not blank the dashboard.
  const duplicates = await listDuplicateMerchantSignalsAsAdmin().then((signals) => signals.length).catch(() => null);

  return (
    <main id="main-content">
      <MarketplaceAdminDashboardView data={data} duplicates={duplicates} links={links} />
    </main>
  );
}
