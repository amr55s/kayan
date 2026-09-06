import Link from 'next/link';
import { AdminDeliveryZonesPanel, CouponManagementPanel, setupErrors, setupMessages } from '@/components/marketplace/operational-setup-panels';
import styles from '@/components/marketplace/operational-setup.module.css';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import { getAdminOperationalSetup } from '@/lib/commerce/operational-setup';
import { deactivateAdminPlatformCouponAction, saveAdminDeliveryZoneAction, saveAdminPlatformCouponAction, setAdminDeliveryZoneActiveAction } from './actions';

function single(value: string | string[] | undefined) { return typeof value === 'string' ? value : ''; }

export default async function AdminMarketplaceSetupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireMarketplaceAdminRole(['super_admin'], { nextPath: '/admin/marketplace/setup' });
  const [params, setup] = await Promise.all([searchParams, getAdminOperationalSetup()]);
  return <main id="main-content" className={styles.page} dir="rtl"><header className={styles.header}><div><h1>إعدادات تشغيل السوق</h1><p>مناطق التوصيل وكوبونات المنصة من مصدر واحد محكوم بالصلاحيات.</p></div><Link href="/admin/marketplace/orders">العودة لعمليات السوق</Link></header>
    {setupMessages[single(params.notice)] ? <p role="status" className={styles.notice}>{setupMessages[single(params.notice)]}</p> : null}
    {setupErrors[single(params.error)] ? <p role="alert" className={styles.error}>{setupErrors[single(params.error)]}</p> : null}
    <AdminDeliveryZonesPanel zones={setup.zones} saveAction={saveAdminDeliveryZoneAction} activateAction={setAdminDeliveryZoneActiveAction} />
    <CouponManagementPanel coupons={setup.coupons} saveAction={saveAdminPlatformCouponAction} deactivateAction={deactivateAdminPlatformCouponAction} />
  </main>;
}
