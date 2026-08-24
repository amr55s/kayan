import { MarketplaceOrderList } from '@/components/commerce-operations/order-list';
import Link from 'next/link';
import { CashOperations, DeliveryOffers } from '@/components/commerce-operations/operations-panels';
import styles from '@/components/commerce-operations/commerce-operations.module.css';
import { requireProfile } from '@/lib/auth/guards';
import { listMyCashReconciliations, listMyCodCollections, listMyMarketplaceDeliveryOffers, listMyMarketplaceOrders } from '@/lib/commerce/operations';

export const dynamic = 'force-dynamic';

export default async function DriverMarketplacePage() {
  await requireProfile(['driver']);
  const [orders, offers, collections, reconciliations] = await Promise.all([
    listMyMarketplaceOrders({ limit: 50 }), listMyMarketplaceDeliveryOffers({ limit: 50 }),
    listMyCodCollections({ limit: 50 }), listMyCashReconciliations({ limit: 50 }),
  ]);
  const returnTo = '/driver/marketplace';
  return <main id="main-content" className={styles.page}><header className={styles.header}><div><p className={styles.eyebrow}>لوحة الكابتن</p><h1 className={styles.title}>عمليات التوصيل</h1><p className={styles.subtitle}>العروض لا تكشف بيانات العميل قبل قبولها، وإثبات التسليم يُحفظ كوسيط خاص.</p></div><Link href="/account/notifications">الإشعارات</Link></header><DeliveryOffers items={offers.items} returnTo={returnTo} /><CashOperations collections={collections.items} reconciliations={reconciliations.items} role="driver" returnTo={returnTo} detailBase="/driver/marketplace/reconciliations" /><h2>التوصيلات المسندة إليك</h2><MarketplaceOrderList orders={orders} detailBase="/driver/marketplace" /></main>;
}
