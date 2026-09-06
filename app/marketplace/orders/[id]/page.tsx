import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { formatMarketplaceMoney } from '@/components/marketplace/format';
import styles from '@/components/marketplace/marketplace.module.css';
import { fetchMyMarketplaceOrderGroup } from '@/lib/commerce/orders';

export const dynamic = 'force-dynamic';

const statusLabels: Record<string, string> = {
  pending_confirmation: 'بانتظار تأكيد المتجر',
  confirmed: 'تم التأكيد',
  preparing: 'جارٍ التجهيز',
  ready_for_pickup: 'جاهز للاستلام',
  out_for_delivery: 'خرج للتوصيل',
  delivery_failed: 'تعذر التوصيل',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
  rejected: 'مرفوض',
  issue: 'قيد حل مشكلة',
  return_requested: 'طلب إرجاع',
  return_approved: 'تمت الموافقة على الإرجاع',
  returned: 'تم الإرجاع',
};

function money(amountMinor: number) {
  return formatMarketplaceMoney({ amountMinor, currency: 'EGP' });
}

export default async function MarketplaceOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const orderGroup = await fetchMyMarketplaceOrderGroup(id);
  if (orderGroup === 'authentication_required') {
    redirect(`/signin?next=${encodeURIComponent(`/marketplace/orders/${id}`)}`);
  }
  if (!orderGroup) notFound();
  const placed = query.placed === '1';

  return (
    <section aria-labelledby="order-title">
      {placed ? (
        <Alert status="success" className="mb-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>تم إنشاء الطلب بنجاح. احتفظ برقم المتابعة الظاهر أدناه.</Alert.Title>
          </Alert.Content>
        </Alert>
      ) : null}
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>طلبك</p>
          <h1 id="order-title" className={styles.title}>رقم المتابعة <bdi dir="ltr">{orderGroup.publicCode}</bdi></h1>
          <p className={styles.subtitle}>الدفع نقدًا عند الاستلام. ستظهر حالة كل متجر داخل هذه الصفحة.</p>
        </div>
        <Link href="/marketplace">
          <Button.Root className={styles.secondaryButton}>
            متابعة التسوق
          </Button.Root>
        </Link>
      </header>

      <div className={styles.cartLayout}>
        <div className={styles.cartGroups}>
          {orderGroup.orders.map((order) => (
            <Card.Root key={order.id} className={styles.cartGroup}>
              <Card.Header className={styles.cartGroupHeader}>
                <span>{order.storeName}</span>
                <Chip.Root size="sm">
                  <Chip.Label>{statusLabels[order.status] ?? order.status}</Chip.Label>
                </Chip.Root>
                <Link href={`/account/orders/${order.id}`}>
                  <Button.Root className={styles.secondaryButton}>
                    متابعة الطلب
                  </Button.Root>
                </Link>
              </Card.Header>
              <Card.Content className={styles.cartLines}>
                {order.items.map((item) => (
                  <article key={item.id} className={styles.cartLine}>
                    <div className={styles.cartImage} aria-hidden={!item.imageUrl}>
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.productName} fill sizes="96px" className={styles.thumbnailImage} />
                      ) : <span className={styles.imageFallback}>لا توجد صورة</span>}
                    </div>
                    <div className={styles.cartLineBody}>
                      <strong className={styles.cartLineTitle}>{item.productName}</strong>
                      {item.variantName ? <p className={styles.cartLineMeta}>{item.variantName}</p> : null}
                      <p className={styles.cartLineMeta}>الكمية: {item.quantity} × {money(item.unitPriceMinor)}</p>
                    </div>
                    <strong className={styles.price}>{money(item.lineTotalMinor)}</strong>
                  </article>
                ))}
                <div className={styles.summaryRows}>
                  <div className={styles.summaryRow}>
                    <span>توصيل {order.deliveryMode === 'platform' ? 'ديرتك' : 'المتجر'}</span>
                    <strong>{money(order.deliveryFeeMinor)}</strong>
                  </div>
                  <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                    <span>إجمالي طلب المتجر</span>
                    <strong>{money(order.grandTotalMinor)}</strong>
                  </div>
                </div>
              </Card.Content>
            </Card.Root>
          ))}
        </div>

        <Card.Root className={styles.summaryCard}>
          <Card.Header className={styles.summaryHeader}>ملخص الدفع</Card.Header>
          <Card.Content className={styles.summaryContent}>
            <div className={styles.summaryRows}>
              <div className={styles.summaryRow}><span>المنتجات</span><strong>{money(orderGroup.subtotalMinor)}</strong></div>
              {orderGroup.discountMinor > 0 ? (
                <div className={styles.summaryRow}><span>الخصم</span><strong>− {money(orderGroup.discountMinor)}</strong></div>
              ) : null}
              <div className={styles.summaryRow}><span>التوصيل</span><strong>{money(orderGroup.deliveryMinor)}</strong></div>
              <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                <span>المطلوب عند الاستلام</span><strong>{money(orderGroup.grandTotalMinor)}</strong>
              </div>
            </div>
            {orderGroup.deliveryNotes ? (
              <div className={styles.codBox}>
                <strong className={styles.codTitle}>ملاحظات التوصيل</strong>
                <p className={styles.codText}>{orderGroup.deliveryNotes}</p>
              </div>
            ) : null}
          </Card.Content>
        </Card.Root>
      </div>
    </section>
  );
}
