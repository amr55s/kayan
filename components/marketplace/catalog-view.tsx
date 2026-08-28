import Link from 'next/link';
import { CatalogControls } from './catalog-controls';
import { MarketplaceProductCard } from './product-card';
import { MarketplaceStatePanel } from './state-panel';
import { ChatEntryButton } from './chat/chat-entry-button';
import type { ChatRecoveryCode } from './chat/chat-entry-state';
import type { ChatLoginIntent } from '@/lib/auth/safe-next';
import type {
  MarketplaceCatalogViewModel,
  MarketplaceFormAction,
} from './view-models';
import styles from './marketplace.module.css';

type MarketplaceCatalogProps = {
  model: MarketplaceCatalogViewModel;
  addToCartAction?: MarketplaceFormAction;
  storeChat?: {
    intent: ChatLoginIntent;
    returnTo: string;
    loginHref: string;
    isAuthenticated: boolean;
    storeName: string;
    recovery?: ChatRecoveryCode | null;
  } | null;
};

function catalogHref(
  model: MarketplaceCatalogViewModel,
  changes: { category?: string | null; cursor?: string | null },
): string {
  const params = new URLSearchParams();
  if (model.query) params.set('q', model.query);
  if (model.selectedSort) params.set('sort', model.selectedSort);
  if (model.selectedStore) params.set('store', model.selectedStore);
  if (model.minPrice) params.set('min_price', model.minPrice);
  if (model.maxPrice) params.set('max_price', model.maxPrice);
  if (model.inStockOnly) params.set('stock', '1');
  if (model.minRating) params.set('rating', String(model.minRating));

  const category = changes.category === undefined
    ? model.selectedCategory
    : changes.category;
  if (category) params.set('category', category);

  if (changes.cursor) params.set('cursor', changes.cursor);
  const query = params.toString();
  return query ? `/marketplace?${query}` : '/marketplace';
}

export function MarketplaceCatalog({ model, addToCartAction, storeChat }: MarketplaceCatalogProps) {
  return (
    <section aria-labelledby="marketplace-catalog-title">
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>المتجر</p>
          <h1 id="marketplace-catalog-title" className={styles.title}>اكتشف منتجات من متاجر منطقتك</h1>
          <p className={styles.subtitle}>
            ابحث وقارن ثم أكمل الطلب والدفع عند الاستلام من داخل الموقع.
          </p>
        </div>
        {storeChat ? (
          <div className="w-full max-w-sm shrink-0" dir="rtl">
            <ChatEntryButton
              intent={storeChat.intent}
              returnTo={storeChat.returnTo}
              loginHref={storeChat.loginHref}
              isAuthenticated={storeChat.isAuthenticated}
              recovery={storeChat.recovery}
              label={`اسأل متجر ${storeChat.storeName}`}
            />
          </div>
        ) : null}
      </header>

      <CatalogControls
        query={model.query}
        selectedCategory={model.selectedCategory}
        selectedStore={model.selectedStore}
        selectedSort={model.selectedSort}
        sortOptions={model.sortOptions}
        stores={model.stores}
        minPrice={model.minPrice}
        maxPrice={model.maxPrice}
        inStockOnly={model.inStockOnly}
        minRating={model.minRating}
      />

      <nav className={styles.categoryBar} aria-label="فئات المنتجات">
        <Link
          href={catalogHref(model, { category: null })}
          className={`${styles.categoryLink} ${model.selectedCategory ? '' : styles.categoryActive}`}
          aria-current={model.selectedCategory ? undefined : 'page'}
        >
          الكل
        </Link>
        {model.categories.map((category) => {
          const isActive = model.selectedCategory === category.slug;
          return (
            <Link
              key={category.id}
              href={catalogHref(model, { category: category.slug })}
              className={`${styles.categoryLink} ${isActive ? styles.categoryActive : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {category.name}
              {typeof category.productCount === 'number' ? (
                <span>({category.productCount})</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <p className={styles.resultSummary} aria-live="polite">
        {model.products.length > 0
          ? `تم تحميل ${model.products.length} منتج مطابق${model.hasMore ? ' — توجد نتائج أخرى' : ''}`
          : 'لا توجد منتجات مطابقة'}
      </p>

      {model.products.length > 0 ? (
        <div className={styles.productGrid}>
          {model.products.map((product) => (
            <MarketplaceProductCard
              key={product.id}
              product={product}
              addToCartAction={addToCartAction}
            />
          ))}
        </div>
      ) : (
        <MarketplaceStatePanel
          title="لم نجد منتجات بهذه المواصفات"
          description="جرّب تعديل كلمات البحث أو اختيار فئة أخرى. لن نعرض نتائج بديلة غير مرتبطة بطلبك."
          actionHref="/marketplace"
          actionLabel="مسح عوامل البحث"
        />
      )}

      {model.hasMore && model.nextCursor ? (
        <nav className={styles.pagination} aria-label="متابعة نتائج المنتجات">
          <Link className={styles.pageLink} href={catalogHref(model, { cursor: model.nextCursor })}>
            النتائج التالية
          </Link>
        </nav>
      ) : null}
    </section>
  );
}
