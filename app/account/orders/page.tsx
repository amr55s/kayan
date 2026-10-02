import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MarketplaceOrderList } from '@/components/commerce-operations/order-list';
import { SupportThreads } from '@/components/commerce-operations/operations-panels';
import { OperationsFeedback } from '@/components/commerce-operations/operations-copy';
import styles from '@/components/commerce-operations/commerce-operations.module.css';
import { listMyMarketplaceOrders, listMyMarketplaceSupportThreads, MarketplaceOperationsError } from '@/lib/commerce/operations';

export const dynamic = 'force-dynamic';

export default async function CustomerOrdersPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const query = await searchParams;
  let orders;
  let support;
  try { [orders, support] = await Promise.all([listMyMarketplaceOrders({ limit: 50 }), listMyMarketplaceSupportThreads({ limit: 50 })]); }
  catch (error) {
    if (error instanceof MarketplaceOperationsError && error.code === 'authentication_required') redirect('/signin?next=%2Faccount%2Forders');
    throw error;
  }
  return <main id="main-content" className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>حسابك</p><h1 className={styles.title}>طلباتك</h1><p className={styles.subtitle}>تابع كل طلب من داخل الموقع، واطلب الإرجاع أو قيّم المنتجات بعد التسليم.</p></div><div className={styles.headerLinks}><Link href="/account/notifications" className={`${styles.link} ${styles.secondary}`}>الإشعارات</Link> <Link href="/marketplace" className={`${styles.link} ${styles.secondary}`}>متابعة التسوق</Link></div></header>
    <OperationsFeedback notice={query.notice} error={query.error} />
    <MarketplaceOrderList orders={orders} detailBase="/account/orders" />
    {support.items.length > 0 ? <SupportThreads items={support.items} detailBase="/account/support" /> : null}
  </main>;
}
