import { DairtakLink } from '@/components/ui/dairtak-link';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { Separator } from '@heroui/react/separator';
import Image from 'next/image';
import Link from 'next/link';
import { formatMarketplaceMoney, marketplaceProductHref } from './format';
import { MarketplaceStatePanel } from './state-panel';
import type {
  MarketplaceCartLineViewModel,
  MarketplaceCartViewModel,
  MarketplaceFormAction,
} from './view-models';
import styles from './marketplace.module.css';

type MarketplaceCartProps = {
  model: MarketplaceCartViewModel;
  updateLineAction?: MarketplaceFormAction;
  removeLineAction?: MarketplaceFormAction;
  applyPromoAction?: MarketplaceFormAction;
  removePromoAction?: MarketplaceFormAction;
  checkoutHref?: string;
};

function CartLine({
  line,
  updateLineAction,
  removeLineAction,
}: {
  line: MarketplaceCartLineViewModel;
  updateLineAction?: MarketplaceFormAction;
  removeLineAction?: MarketplaceFormAction;
}) {
  return (
    <article className={styles.cartLine}>
      <Link href={marketplaceProductHref({ id: line.productId, slug: line.productSlug })} className={styles.cartImage} tabIndex={-1}>
        {line.image ? (
          <Image
            src={line.image.url}
            alt={line.image.alt}
            fill
            sizes="96px"
            className={styles.thumbnailImage}
          />
        ) : (
          <span className={styles.imageFallback}>لا توجد صورة</span>
        )}
      </Link>

      <div className={styles.cartLineBody}>
        <Link
          href={marketplaceProductHref({ id: line.productId, slug: line.productSlug })}
          className={styles.cartLineTitle}
        >
          {line.productName}
        </Link>
        {line.variantLabel ? <p className={styles.cartLineMeta}>{line.variantLabel}</p> : null}
        <strong className={styles.price}>{formatMarketplaceMoney(line.unitPrice)}</strong>
        {!line.isAvailable ? (
          <p className={`${styles.cartLineMeta} ${styles.outOfStock}`}>
            هذا المنتج لم يعد متوفرًا. احذفه قبل إكمال الطلب.
          </p>
        ) : null}

        <div className={styles.cartActions}>
          {updateLineAction ? (
            <form action={updateLineAction} className={styles.cartActions}>
              <input type="hidden" name="variantId" value={line.variantId} />
              <div className={styles.selectWrap}>
                <Label.Root htmlFor={`quantity-${line.id}`} className={styles.label}>
                  الكمية
                </Label.Root>
                <Input.Root
                  id={`quantity-${line.id}`}
                  name="quantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={Math.max(1, line.maxQuantity)}
                  defaultValue={String(line.quantity)}
                  className={styles.quantityInput}
                />
              </div>
              <Button.Root type="submit" className={styles.secondaryButton}>
                تحديث
              </Button.Root>
            </form>
          ) : (
            <span className={styles.muted}>الكمية: {line.quantity}</span>
          )}

          {removeLineAction ? (
            <form action={removeLineAction}>
              <input type="hidden" name="variantId" value={line.variantId} />
              <Button.Root type="submit" className={styles.dangerButton}>
                حذف
              </Button.Root>
            </form>
          ) : null}
        </div>
      </div>

      <strong className={styles.price}>{formatMarketplaceMoney(line.lineTotal)}</strong>
    </article>
  );
}

export function MarketplaceCart({
  model,
  updateLineAction,
  removeLineAction,
  applyPromoAction,
  removePromoAction,
  checkoutHref = '/marketplace/checkout',
}: MarketplaceCartProps) {
  if (model.groups.length === 0 || model.itemCount === 0) {
    return (
      <MarketplaceStatePanel
        title="سلتك فارغة"
        description="أضف المنتجات التي تحتاجها، وستظل السلة مرتبطة بحسابك عند تسجيل الدخول."
        actionHref="/marketplace"
        actionLabel="تصفّح المنتجات"
      />
    );
  }

  const hasUnavailableLines = model.groups.some((group) =>
    group.lines.some((line) => !line.isAvailable),
  );

  return (
    <section aria-labelledby="cart-title">
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>السلة</p>
          <h1 id="cart-title" className={styles.title}>مراجعة طلبك</h1>
          <p className={styles.subtitle}>{model.itemCount} عنصر في السلة</p>
        </div>
      </header>

      {model.groups.length > 1 ? (
        <p className={styles.notice}>
          تحتوي السلة على أكثر من متجر. عند التأكيد سيُنشأ طلب مستقل لكل متجر مع بقاء التجربة في خطوة واحدة.
        </p>
      ) : null}

      <div className={styles.cartLayout}>
        <div className={styles.cartGroups}>
          {model.groups.map((group) => (
            <Card.Root key={group.store.id} className={styles.cartGroup}>
              <Card.Header className={styles.cartGroupHeader}>
                {group.store.name}
              </Card.Header>
              <Card.Content className={styles.cartLines}>
                {group.lines.map((line) => (
                  <CartLine
                    key={line.id}
                    line={line}
                    updateLineAction={updateLineAction}
                    removeLineAction={removeLineAction}
                  />
                ))}
              </Card.Content>
            </Card.Root>
          ))}
        </div>

        <Card.Root className={styles.summaryCard}>
          <Card.Header className={styles.summaryHeader}>ملخص السلة</Card.Header>
          <Card.Content className={styles.summaryContent}>
            {model.appliedPromoCode ? (
              removePromoAction ? (
                <form action={removePromoAction} className={styles.cartActions}>
                  <span className={styles.promo}>كود الخصم: {model.appliedPromoCode}</span>
                  <Button.Root type="submit" className={styles.secondaryButton}>
                    إزالة
                  </Button.Root>
                </form>
              ) : (
                <span className={styles.promo}>كود الخصم: {model.appliedPromoCode}</span>
              )
            ) : applyPromoAction ? (
              <form action={applyPromoAction} className={styles.purchaseForm}>
                <div className={styles.selectWrap}>
                  <Label.Root htmlFor="marketplace-promo-code" className={styles.label}>
                    كود الخصم
                  </Label.Root>
                  <Input.Root
                    id="marketplace-promo-code"
                    name="promoCode"
                    autoComplete="off"
                    minLength={3}
                    maxLength={32}
                    className={styles.field}
                  />
                </div>
                <Button.Root type="submit" className={styles.secondaryButton}>
                  تطبيق
                </Button.Root>
              </form>
            ) : null}
            <div className={styles.summaryRows}>
              <div className={styles.summaryRow}>
                <span>إجمالي المنتجات</span>
                <strong>{formatMarketplaceMoney(model.subtotal)}</strong>
              </div>
              {model.discount.amountMinor > 0 ? (
                <div className={styles.summaryRow}>
                  <span>الخصم</span>
                  <strong>− {formatMarketplaceMoney(model.discount)}</strong>
                </div>
              ) : null}
              <div className={styles.summaryRow}>
                <span>التوصيل المتوقع</span>
                <strong>
                  {model.estimatedDelivery
                    ? formatMarketplaceMoney(model.estimatedDelivery)
                    : 'يُحسب حسب المنطقة'}
                </strong>
              </div>
              <Separator />
              <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                <span>الإجمالي</span>
                <strong>{formatMarketplaceMoney(model.total)}</strong>
              </div>
            </div>
            {hasUnavailableLines ? (
              <p className={styles.notice}>احذف المنتجات غير المتوفرة قبل المتابعة.</p>
            ) : (
              <DairtakLink href={checkoutHref} className={styles.primaryButton} variant="primary">
                  متابعة إتمام الطلب
                </DairtakLink>
            )}
          </Card.Content>
        </Card.Root>
      </div>
    </section>
  );
}
