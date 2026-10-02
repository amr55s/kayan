import { DairtakLink } from '@/components/ui/dairtak-link';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import Image from 'next/image';
import Link from 'next/link';
import { AddToCartCardForm } from './add-to-cart';
import {
  formatMarketplaceCount,
  formatMarketplaceMoney,
  formatMarketplaceQuantity,
  formatMarketplaceRating,
  MARKETPLACE_REVIEW_NOUN,
  marketplaceDiscountPercentage,
  marketplaceProductHref,
  marketplaceStoreHref,
} from './format';
import type {
  MarketplaceAddToCartAction,
  MarketplaceProductSummary,
} from './view-models';
import styles from './marketplace.module.css';

type MarketplaceProductCardProps = {
  product: MarketplaceProductSummary;
  addToCartAction?: MarketplaceAddToCartAction;
};

export function MarketplaceProductCard({
  product,
  addToCartAction,
}: MarketplaceProductCardProps) {
  const productHref = marketplaceProductHref(product);
  const discount = marketplaceDiscountPercentage(product.price, product.compareAtPrice);
  const showRating = Boolean(product.rating && product.rating.count > 0);
  const defaultVariantId = product.defaultVariantId;

  return (
    <Card.Root className={styles.productCard}>
      <Link href={productHref} className={styles.productImageLink} tabIndex={-1} aria-hidden="true">
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
        {product.badge || discount ? (
          <span className={styles.tagRow}>
            {discount ? (
              <span className={styles.discountTag}>خصم {formatMarketplaceCount(discount)}٪</span>
            ) : null}
            {product.badge ? (
              <Chip.Root size="sm" variant="primary">
                <Chip.Label className={styles.tag}>{product.badge}</Chip.Label>
              </Chip.Root>
            ) : null}
          </span>
        ) : null}
        {product.isInStock ? null : (
          <span className={styles.soldOutOverlay}>غير متوفر حاليًا</span>
        )}
      </Link>

      <Card.Header className={styles.cardHeader}>
        <Link href={marketplaceStoreHref(product.store.slug)} className={styles.storeName}>
          {product.store.name}
        </Link>
        <Link href={productHref} className={styles.productTitleLink}>
          <h2 className={styles.productTitle}>{product.name}</h2>
        </Link>
        {showRating && product.rating ? (
          <span
            className={styles.rating}
            aria-label={`التقييم ${formatMarketplaceRating(product.rating.average)} من ٥ بناءً على ${formatMarketplaceQuantity(product.rating.count, MARKETPLACE_REVIEW_NOUN)}`}
          >
            <span className={styles.stars} aria-hidden="true">★</span>
            <span aria-hidden="true">{formatMarketplaceRating(product.rating.average)}</span>
            <span aria-hidden="true">({formatMarketplaceCount(product.rating.count)})</span>
          </span>
        ) : null}
        <span className={styles.priceRow}>
          <span className={styles.price}>{formatMarketplaceMoney(product.price)}</span>
          {product.compareAtPrice && discount ? (
            <span className={styles.comparePrice}>
              <span className="sr-only">السعر قبل الخصم </span>
              {formatMarketplaceMoney(product.compareAtPrice)}
            </span>
          ) : null}
        </span>
      </Card.Header>

      <Card.Footer className={styles.cardFooter}>
        {addToCartAction && defaultVariantId && product.isInStock ? (
          <AddToCartCardForm
            action={addToCartAction}
            productId={product.id}
            variantId={defaultVariantId}
            productName={product.name}
          />
        ) : (
          <DairtakLink href={productHref} className={styles.secondaryButton}>
            عرض التفاصيل
          </DairtakLink>
        )}
      </Card.Footer>
    </Card.Root>
  );
}
