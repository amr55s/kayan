import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import Image from 'next/image';
import Link from 'next/link';
import {
  formatMarketplaceMoney,
  marketplaceDiscountPercentage,
  marketplaceProductHref,
} from './format';
import type {
  MarketplaceFormAction,
  MarketplaceProductSummary,
} from './view-models';
import styles from './marketplace.module.css';

type MarketplaceProductCardProps = {
  product: MarketplaceProductSummary;
  addToCartAction?: MarketplaceFormAction;
};

export function MarketplaceProductCard({
  product,
  addToCartAction,
}: MarketplaceProductCardProps) {
  const productHref = marketplaceProductHref(product);
  const discount = marketplaceDiscountPercentage(product.price, product.compareAtPrice);
  const showRating = Boolean(product.rating && product.rating.count > 0);

  return (
    <Card.Root className={styles.productCard}>
      <Link href={productHref} className={styles.productImageLink} tabIndex={-1}>
        {product.primaryImage ? (
          <Image
            src={product.primaryImage.url}
            alt={product.primaryImage.alt}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className={styles.productImage}
            placeholder={product.primaryImage.blurDataUrl ? 'blur' : 'empty'}
            blurDataURL={product.primaryImage.blurDataUrl ?? undefined}
          />
        ) : (
          <span className={styles.imageFallback}>لا توجد صورة للمنتج</span>
        )}
        {product.badge ? (
          <span className={styles.tagRow}>
            <Chip.Root size="sm" className={styles.tag}>
              <Chip.Label>{product.badge}</Chip.Label>
            </Chip.Root>
          </span>
        ) : null}
      </Link>

      <Card.Header className={styles.cardHeader}>
        <span className={styles.storeName}>{product.store.name}</span>
        <Link href={productHref} className={styles.productTitleLink}>
          <Card.Title className={styles.productTitle}>{product.name}</Card.Title>
        </Link>
        {showRating && product.rating ? (
          <span
            className={styles.rating}
            aria-label={`التقييم ${product.rating.average.toFixed(1)} من 5 بناءً على ${product.rating.count} تقييم`}
          >
            <span className={styles.stars} aria-hidden="true">★</span>
            <bdi dir="ltr">{product.rating.average.toFixed(1)}</bdi>
            <span>({product.rating.count})</span>
          </span>
        ) : null}
        <span className={styles.priceRow}>
          <span className={styles.price}>{formatMarketplaceMoney(product.price)}</span>
          {product.compareAtPrice && discount ? (
            <>
              <span className={styles.comparePrice}>
                {formatMarketplaceMoney(product.compareAtPrice)}
              </span>
              <span className={styles.discount}>خصم {discount}%</span>
            </>
          ) : null}
        </span>
      </Card.Header>

      <Card.Footer className={styles.cardFooter}>
        <span
          className={`${styles.statusLine} ${product.isInStock ? '' : styles.outOfStock}`}
        >
          {product.isInStock ? product.fulfillmentLabel ?? 'متاح للطلب' : 'غير متوفر حاليًا'}
        </span>
        {addToCartAction ? (
          <form action={addToCartAction}>
            <input type="hidden" name="productId" value={product.id} />
            {product.defaultVariantId ? (
              <input type="hidden" name="variantId" value={product.defaultVariantId} />
            ) : null}
            <input type="hidden" name="quantity" value="1" />
            <Button.Root
              type="submit"
              fullWidth
              isDisabled={!product.isInStock}
              className={styles.primaryButton}
            >
              أضف إلى السلة
            </Button.Root>
          </form>
        ) : (
          <Link href={productHref} className={styles.secondaryButton}>
            عرض التفاصيل
          </Link>
        )}
      </Card.Footer>
    </Card.Root>
  );
}
