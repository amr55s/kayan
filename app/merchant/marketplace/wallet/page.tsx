import { MerchantStatePanel } from '@/components/marketplace/merchant/merchant-state-panel';
import { MerchantWalletPanel, walletErrors, walletMessages } from '@/components/marketplace/merchant/wallet-panel';
import styles from '@/components/marketplace/merchant/wallet.module.css';
import { listMyManageableMerchants } from '@/lib/commerce/operational-setup';
import { getMyMerchantWallet, WalletError } from '@/lib/commerce/wallet';
import { purchaseWalletSubscriptionAction, requestWalletTopupAction } from './actions';

function single(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

export default async function MerchantWalletPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  let wallet;
  let merchants: Array<{ id: string; name: string }> = [];
  try {
    [wallet, merchants] = await Promise.all([
      getMyMerchantWallet(single(params.merchant) || null),
      listMyManageableMerchants(),
    ]);
  } catch (error) {
    const code = error instanceof WalletError ? error.code : 'service_unavailable';
    if (code === 'access_denied') {
      return (
        <MerchantStatePanel
          kind="empty"
          title="لا توجد محفظة بعد"
          description="المحفظة تُنشأ مع أول متجر معتمد لحسابك. أنشئ متجرك أولًا ثم ارجع إلى هنا."
          action={{ href: '/merchant/marketplace/settings', label: 'إعداد المتجر' }}
        />
      );
    }
    return (
      <MerchantStatePanel
        kind="error"
        title="تعذر تحميل المحفظة"
        description={walletErrors[code] ?? walletErrors.service_unavailable}
        action={{ href: '/merchant/marketplace/wallet', label: 'إعادة المحاولة' }}
      />
    );
  }

  const notice = walletMessages[single(params.notice)];
  const error = walletErrors[single(params.error)];
  return (
    <>
      {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <MerchantWalletPanel
        wallet={wallet}
        merchants={merchants}
        actions={{ requestTopup: requestWalletTopupAction, purchaseSubscription: purchaseWalletSubscriptionAction }}
      />
    </>
  );
}
