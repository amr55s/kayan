import { Card } from '@heroui/react/card';
import Link from 'next/link';
import { formatMarketplaceMoney } from '@/components/marketplace/format';
import type { MarketplaceOrderSummary } from '@/lib/commerce/operations';
import { marketplaceStatusLabels } from './order-status';
import styles from './commerce-operations.module.css';

export function MarketplaceOrderList({
  orders,
  detailBase,
}: {
  orders: MarketplaceOrderSummary[];
  detailBase: string;
}) {
  if (orders.length === 0) {
    return <div className={styles.empty}><h2>لا توجد طلبات حتى الآن</h2><p>ستظهر الطلبات هنا فور إنشائها أو إسنادها إليك.</p></div>;
  }
  return (
    <div className={styles.list}>
      {orders.map((order) => (
        <Card.Root key={order.id} className={styles.card}>
          <Card.Content className={styles.cardContent}>
            <div className={styles.orderHead}>
              <div>
                <p className={styles.orderCode}>طلب <bdi dir="ltr">{order.publicCode}</bdi></p>
                <p className={styles.meta}>{order.storeName} · {new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.createdAt))}</p>
              </div>
              <span className={styles.status}>{marketplaceStatusLabels[order.status]}</span>
            </div>
            <div className={styles.row}>
              <strong>{formatMarketplaceMoney({ amountMinor: order.grandTotalMinor, currency: 'EGP' })}</strong>
              <Link className={styles.link} href={`${detailBase}/${order.id}`}>عرض التفاصيل</Link>
            </div>
          </Card.Content>
        </Card.Root>
      ))}
    </div>
  );
}
