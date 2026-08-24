import type { MarketplaceSortOption } from './view-models';
import type { MarketplaceStoreFilter } from './view-models';
import styles from './marketplace.module.css';

type CatalogControlsProps = {
  query: string;
  selectedCategory: string | null;
  selectedStore: string | null;
  selectedSort: string;
  sortOptions: MarketplaceSortOption[];
  stores: MarketplaceStoreFilter[];
  minPrice: string;
  maxPrice: string;
  inStockOnly: boolean;
  minRating: number | null;
};

export function CatalogControls({
  query,
  selectedCategory,
  selectedStore,
  selectedSort,
  sortOptions,
  stores,
  minPrice,
  maxPrice,
  inStockOnly,
  minRating,
}: CatalogControlsProps) {
  return (
    <form className={styles.controls} action="/marketplace" method="get" role="search">
      <div className={styles.selectWrap}>
        <label htmlFor="marketplace-search" className={styles.label}>
          ابحث في المنتجات
        </label>
        <input
          id="marketplace-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="اسم المنتج أو المتجر"
          className={styles.field}
          autoComplete="off"
        />
      </div>

      <label className={styles.selectWrap} htmlFor="marketplace-store">
        <span className={styles.label}>البائع</span>
        <select id="marketplace-store" name="store" defaultValue={selectedStore ?? ''} className={styles.selectField}>
          <option value="">كل المتاجر</option>
          {stores.map((store) => (
            <option key={store.slug} value={store.slug}>{store.name} ({store.productCount})</option>
          ))}
        </select>
      </label>

      <div className={styles.selectWrap}>
        <label htmlFor="marketplace-min-price" className={styles.label}>أقل سعر (جنيه)</label>
        <input id="marketplace-min-price" name="min_price" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={minPrice} className={styles.field} />
      </div>

      <div className={styles.selectWrap}>
        <label htmlFor="marketplace-max-price" className={styles.label}>أعلى سعر (جنيه)</label>
        <input id="marketplace-max-price" name="max_price" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={maxPrice} className={styles.field} />
      </div>

      <label className={styles.selectWrap} htmlFor="marketplace-rating">
        <span className={styles.label}>الحد الأدنى للتقييم</span>
        <select id="marketplace-rating" name="rating" defaultValue={minRating ?? ''} className={styles.selectField}>
          <option value="">الكل</option>
          {[4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} نجوم فأكثر</option>)}
        </select>
      </label>

      <label className={styles.checkboxLabel}>
        <input name="stock" value="1" type="checkbox" defaultChecked={inStockOnly} />
        المتوفر فقط
      </label>

      <label className={styles.selectWrap} htmlFor="marketplace-sort">
        <span className={styles.label}>الترتيب</span>
        <select
          id="marketplace-sort"
          name="sort"
          defaultValue={selectedSort}
          className={styles.selectField}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {selectedCategory ? (
        <input type="hidden" name="category" value={selectedCategory} />
      ) : null}
      <button type="submit" className={styles.primaryButton}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        بحث
      </button>
    </form>
  );
}
