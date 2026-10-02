import Link from 'next/link';
import { MarketplaceWalletsAdminView, walletAdminErrors, walletAdminMessages } from '@/components/admin/marketplace-wallets';
import styles from '@/components/admin/marketplace-dashboard.module.css';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import {
  getMarketplaceWalletAdminOverview,
  listDuplicateMerchantSignalsAsAdmin,
  WalletError,
  type WalletTopupStatus,
} from '@/lib/commerce/wallet';
import {
  adjustMerchantWalletAction,
  reviewWalletTopupAction,
  saveFeeSettingsAction,
  saveSubscriptionPlanAction,
} from './actions';

export const dynamic = 'force-dynamic';

const statuses = new Set<WalletTopupStatus>(['pending', 'approved', 'rejected']);

export default async function AdminMarketplaceWalletsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; notice?: string; error?: string }>;
}) {
  await requireMarketplaceAdminRole(['finance'], { nextPath: '/admin/marketplace/wallets' });
  const params = await searchParams;
  const status = statuses.has(params.status as WalletTopupStatus) ? params.status as WalletTopupStatus : 'pending';
  const notice = walletAdminMessages[params.notice ?? ''];
  const error = walletAdminErrors[params.error ?? ''];

  let overview;
  let loadError: string | null = null;
  try {
    overview = await getMarketplaceWalletAdminOverview(status);
  } catch (caught) {
    loadError = walletAdminErrors[caught instanceof WalletError ? caught.code : 'service_unavailable']
      ?? walletAdminErrors.service_unavailable!;
  }
  const duplicates = overview ? await listDuplicateMerchantSignalsAsAdmin().catch(() => []) : [];

  return (
    <main id="main-content" className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>إدارة المنصة · المالية</p>
          <h1 className={styles.title}>المحافظ والرسوم</h1>
          <p className={styles.subtitle}>راجع تحويلات الشحن، واضبط رسم الطلب والطلبات المجانية والاشتراكات.</p>
        </div>
        <nav className={styles.links} aria-label="التنقل">
          <Link href="/admin/marketplace/dashboard">لوحة المتابعة</Link>
          <Link href="/admin/marketplace/orders">الطلبات والمراجعات</Link>
        </nav>
      </header>
      {notice ? <p role="status" className={styles.allClear}>{notice}</p> : null}
      {error ? <p role="alert" className={styles.warning}>{error}</p> : null}
      {loadError ? <p role="alert" className={styles.warning}>{loadError}</p> : null}
      {overview ? (
        <MarketplaceWalletsAdminView
          overview={overview}
          status={status}
          duplicates={duplicates}
          actions={{
            reviewTopup: reviewWalletTopupAction,
            adjustWallet: adjustMerchantWalletAction,
            saveSettings: saveFeeSettingsAction,
            savePlan: saveSubscriptionPlanAction,
          }}
        />
      ) : null}
    </main>
  );
}
