import Link from 'next/link';
import { MarketplaceOrderList } from '@/components/commerce-operations/order-list';
import { CommissionStatements, SupportThreads } from '@/components/commerce-operations/operations-panels';
import { OperationsFeedback } from '@/components/commerce-operations/operations-copy';
import styles from '@/components/commerce-operations/commerce-operations.module.css';
import { requireProfile } from '@/lib/auth/guards';
import { listMyCommissionStatements, listMyMarketplaceOrders, listMyMarketplaceSupportThreads } from '@/lib/commerce/operations';

export const dynamic = 'force-dynamic';

export default async function MerchantMarketplaceOrdersPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  await requireProfile(['merchant']);
  const query = await searchParams;
  const [orders, support] = await Promise.all([listMyMarketplaceOrders({ limit: 50 }), listMyMarketplaceSupportThreads({ limit: 50 })]);
  const storeIds = [...new Set(orders.map((order) => order.storeId))];
  const statements = (await Promise.all(storeIds.map((storeId) => listMyCommissionStatements(storeId, { limit: 12 })))).flatMap((page) => page.items);
  return <section className={styles.page}><header className={styles.header}><div><p className={styles.eyebrow}>تشغيل المتجر</p><h1 className={styles.title}>طلبات المتجر</h1><p className={styles.subtitle}>اقبل الطلب لتظهر لك بيانات العميل، ثم جهّزه ووصّله وحدّث حالته من هنا.</p></div><div className={styles.headerLinks}><Link href="/merchant/marketplace/wallet" className={`${styles.link} ${styles.secondary}`}>المحفظة</Link>{orders.length > 0 ? <a href="/merchant/marketplace/orders/export" className={`${styles.link} ${styles.secondary}`} download>تصدير الطلبات (CSV)</a> : null}</div></header><OperationsFeedback notice={query.notice} error={query.error} /><h2 className={styles.sectionTitle}>الطلبات</h2><MarketplaceOrderList orders={orders} detailBase="/merchant/marketplace/orders" />{statements.length > 0 ? <CommissionStatements items={statements} detailBase="/merchant/marketplace/commissions" /> : null}{support.items.length > 0 ? <SupportThreads items={support.items} detailBase="/merchant/marketplace/support" /> : null}</section>;
}
