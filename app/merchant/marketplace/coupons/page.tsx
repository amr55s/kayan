import Link from 'next/link';
import { CouponManagementPanel, setupErrors, setupMessages, StoreOnboardingPanel } from '@/components/marketplace/operational-setup-panels';
import styles from '@/components/marketplace/operational-setup.module.css';
import { getMerchantOperationalSetup } from '@/lib/commerce/operational-setup';
import { createMarketplaceStoreAction, deactivateMerchantMarketplaceCouponAction, saveMerchantMarketplaceCouponAction } from '@/app/merchant/marketplace/setup-actions';

function single(value: string | string[] | undefined) { return typeof value === 'string' ? value : ''; }

export default async function MerchantMarketplaceCouponsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const setup = await getMerchantOperationalSetup(single(params.store) || null);
  return <div className={styles.page}><header className={styles.header}><div><h1>الكوبونات</h1><p>عروض على مستوى المتجر فقط، بحدود استخدام وفترة صلاحية واضحة.</p></div></header>
    {setupMessages[single(params.notice)] ? <p role="status" className={styles.notice}>{setupMessages[single(params.notice)]}</p> : null}
    {setupErrors[single(params.error)] ? <p role="alert" className={styles.error}>{setupErrors[single(params.error)]}</p> : null}
    {setup.selected ? <><nav className={styles.switcher} aria-label="اختيار المتجر">{setup.stores.map((store) => <Link key={store.id} href={`/merchant/marketplace/coupons?store=${encodeURIComponent(store.id)}`} data-active={store.id === setup.selected?.id}>{store.name}</Link>)}</nav><CouponManagementPanel coupons={setup.coupons} storeId={setup.selected.id} saveAction={saveMerchantMarketplaceCouponAction} deactivateAction={deactivateMerchantMarketplaceCouponAction} /></> : <StoreOnboardingPanel merchants={setup.merchants} action={createMarketplaceStoreAction} />}
  </div>;
}
