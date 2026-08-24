import { MarketplaceOrderList } from '@/components/commerce-operations/order-list';
import { CommissionStatements, SupportThreads } from '@/components/commerce-operations/operations-panels';
import styles from '@/components/commerce-operations/commerce-operations.module.css';
import { requireProfile } from '@/lib/auth/guards';
import { listMyCommissionStatements, listMyMarketplaceOrders, listMyMarketplaceSupportThreads } from '@/lib/commerce/operations';

export const dynamic = 'force-dynamic';

export default async function MerchantMarketplaceOrdersPage() {
  await requireProfile(['merchant']);
  const [orders, support] = await Promise.all([listMyMarketplaceOrders({ limit: 50 }), listMyMarketplaceSupportThreads({ limit: 50 })]);
  const storeIds = [...new Set(orders.map((order) => order.storeId))];
  const statements = (await Promise.all(storeIds.map((storeId) => listMyCommissionStatements(storeId, { limit: 12 })))).flatMap((page) => page.items);
  return <section className={styles.page}><header className={styles.header}><div><p className={styles.eyebrow}>تشغيل المتجر</p><h1 className={styles.title}>طلبات وماليات المتجر</h1><p className={styles.subtitle}>أكد الطلبات وجهّزها وتابع العمولات والدعم من داخل الموقع.</p></div></header><CommissionStatements items={statements} detailBase="/merchant/marketplace/commissions" /><SupportThreads items={support.items} detailBase="/merchant/marketplace/support" /><MarketplaceOrderList orders={orders} detailBase="/merchant/marketplace/orders" /></section>;
}
