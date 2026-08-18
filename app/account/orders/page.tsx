import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MarketplaceOrderList } from '@/components/commerce-operations/order-list';
import { SupportThreads } from '@/components/commerce-operations/operations-panels';
import styles from '@/components/commerce-operations/commerce-operations.module.css';
import { listMyMarketplaceOrders, listMyMarketplaceSupportThreads, MarketplaceOperationsError } from '@/lib/commerce/operations';

export const dynamic = 'force-dynamic';

export default async function CustomerOrdersPage() {
  let orders;
  let support;
  try { [orders, support] = await Promise.all([listMyMarketplaceOrders({ limit: 50 }), listMyMarketplaceSupportThreads({ limit: 50 })]); }
  catch (error) {
    if (error instanceof MarketplaceOperationsError && error.code === 'authentication_required') redirect('/signin?next=%2Faccount%2Forders');
    throw error;
  }
  return <main id="main-content" className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>حسابك</p><h1 className={styles.title}>طلباتك</h1><p className={styles.subtitle}>تابع كل طلب من داخل الموقع، واطلب الإرجاع أو قيّم المنتجات بعد التسليم.</p></div><div><Link href="/account/notifications" className={`${styles.link} ${styles.secondary}`}>الإشعارات</Link> <Link href="/marketplace" className={`${styles.link} ${styles.secondary}`}>متابعة التسوق</Link></div></header>
    <SupportThreads items={support.items} detailBase="/account/support" />
    <MarketplaceOrderList orders={orders} detailBase="/account/orders" />
  </main>;
}
