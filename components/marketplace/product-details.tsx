import { Breadcrumbs } from '@heroui/react/breadcrumbs';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { Separator } from '@heroui/react/separator';
import Link from 'next/link';
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
import { MarketplaceProductCard } from './product-card';
import { MarketplaceProductGallery } from './product-gallery';
import { MarketplacePurchaseForm } from './purchase-form';
import { ChatEntryButton } from './chat/chat-entry-button';
import type {
  MarketplaceAddToCartAction,
  MarketplaceProductDetailsViewModel,
  MarketplaceProductSummary,
} from './view-models';
import styles from './marketplace.module.css';
import type { ChatRecoveryCode } from './chat/chat-entry-state';

export function MarketplaceProductDetails({
  product,
  addToCartAction,
  isAuthenticated,
  chatLoginHref,
  chatRecovery,
  relatedProducts = [],
}: {
  product: MarketplaceProductDetailsViewModel;
  addToCartAction?: MarketplaceAddToCartAction;
  isAuthenticated: boolean;
  chatLoginHref: string;
  chatRecovery?: ChatRecoveryCode | null;
  relatedProducts?: MarketplaceProductSummary[];
}) {
  const discount = marketplaceDiscountPercentage(product.price, product.compareAtPrice);
  const showRating = Boolean(product.rating && product.rating.count > 0);
  const images = product.images.length > 0
    ? product.images.slice(0, 10)
    : product.primaryImage
      ? [product.primaryImage]
      : [];

  return (
    <div>
      <Breadcrumbs className={styles.breadcrumbs}>
        <Breadcrumbs.Item href="/marketplace">المتجر</Breadcrumbs.Item>
        <Breadcrumbs.Item href={marketplaceStoreHref(product.store.slug)}>
          {product.store.name}
        </Breadcrumbs.Item>
        <Breadcrumbs.Item>{product.name}</Breadcrumbs.Item>
      </Breadcrumbs>
      <article className={styles.detailsGrid}>
        <MarketplaceProductGallery images={images} productName={product.name} />

      <Card.Root className={styles.detailsPanel}>
        <Card.Content className={styles.detailsContent}>
          <div>
            <Link href={marketplaceStoreHref(product.store.slug)} className={styles.storeName}>
              يباع بواسطة {product.store.name}
              {product.store.isVerified ? ' — متجر موثّق' : ''}
            </Link>
            <h1 className={styles.detailsName}>{product.name}</h1>
          </div>

          {product.badge ? (
            <Chip.Root size="sm" className={styles.tag}>
              <Chip.Label>{product.badge}</Chip.Label>
            </Chip.Root>
          ) : null}

          {showRating && product.rating ? (
            <span
              className={styles.rating}
              aria-label={`التقييم ${formatMarketplaceRating(product.rating.average)} من ٥ بناءً على ${formatMarketplaceQuantity(product.rating.count, MARKETPLACE_REVIEW_NOUN)}`}
            >
              <span className={styles.stars} aria-hidden="true">★</span>
              <span aria-hidden="true">{formatMarketplaceRating(product.rating.average)}</span>
              <span aria-hidden="true">· {formatMarketplaceQuantity(product.rating.count, MARKETPLACE_REVIEW_NOUN)}</span>
            </span>
          ) : null}

          <div className={styles.priceRow}>
            <strong className={styles.detailsPrice}>{formatMarketplaceMoney(product.price)}</strong>
            {product.compareAtPrice && discount ? (
              <>
                <span className={styles.comparePrice}>
                  <span className="sr-only">السعر قبل الخصم </span>
                  {formatMarketplaceMoney(product.compareAtPrice)}
                </span>
                <span className={styles.discountTag}>وفّر {formatMarketplaceCount(discount)}٪</span>
              </>
            ) : null}
          </div>

          <Separator className={styles.divider} />

          <MarketplacePurchaseForm
            productId={product.id}
            basePrice={product.price}
            variants={product.variants}
            maxQuantityPerOrder={product.maxQuantityPerOrder}
            isInStock={product.isInStock}
            addToCartAction={addToCartAction}
          />

          {product.deliveryNote || product.returnPolicyNote ? (
            <ul className={styles.assuranceList}>
              {product.deliveryNote ? <li>{product.deliveryNote}</li> : null}
              {product.returnPolicyNote ? <li>{product.returnPolicyNote}</li> : null}
            </ul>
          ) : null}

          <ChatEntryButton
            intent={{ kind: 'presale', storeId: product.store.id, productId: product.id }}
            returnTo={marketplaceProductHref(product)}
            loginHref={chatLoginHref}
            isAuthenticated={isAuthenticated}
            recovery={chatRecovery}
            label="اسأل المتجر عن هذا المنتج"
          />

          {product.description ? (
            <section aria-labelledby="product-description-title">
              <h2 id="product-description-title" className={styles.stateTitle}>وصف المنتج</h2>
              <p className={styles.description}>{product.description}</p>
            </section>
          ) : null}

          {product.highlights.length > 0 ? (
            <section aria-labelledby="product-highlights-title">
              <h2 id="product-highlights-title" className={styles.stateTitle}>أهم التفاصيل</h2>
              <ul className={styles.highlightList}>
                {product.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </Card.Content>
      </Card.Root>
      </article>
      {relatedProducts.length > 0 ? (
        <section className={styles.relatedSection} aria-labelledby="related-products-title">
          <h2 id="related-products-title" className={styles.relatedTitle}>
            المزيد من {product.store.name}
          </h2>
          <div className={styles.productGrid}>
            {relatedProducts.map((related) => (
              <MarketplaceProductCard
                key={related.id}
                product={related}
                addToCartAction={addToCartAction}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
