import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { EmptyState } from '@heroui/react/empty-state';
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
    return (
      <EmptyState className={styles.empty}>
        <h2>لا توجد طلبات حتى الآن</h2>
        <p>ستظهر الطلبات هنا فور إنشائها أو إسنادها إليك.</p>
      </EmptyState>
    );
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
              <Chip.Root size="sm">
                <Chip.Label className={styles.status}>{marketplaceStatusLabels[order.status]}</Chip.Label>
              </Chip.Root>
            </div>
            <div className={styles.row}>
              <strong>{formatMarketplaceMoney({ amountMinor: order.grandTotalMinor, currency: 'EGP' })}</strong>
              <Link href={`${detailBase}/${order.id}`}>
                <Button.Root className={styles.link}>
                  عرض التفاصيل
                </Button.Root>
              </Link>
            </div>
          </Card.Content>
        </Card.Root>
      ))}
    </div>
  );
}
