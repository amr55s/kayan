import Link from 'next/link';
import { RotateCcw, Search } from 'lucide-react';
import type { MarketplaceCatalogViewModel } from './view-models';
import { countActiveCatalogFilters } from './catalog-filter-state';
import styles from './marketplace.module.css';

export { countActiveCatalogFilters };

export type CatalogFiltersProps = {
  model: MarketplaceCatalogViewModel;
  idPrefix?: string;
  isMobileDrawer?: boolean;
  onApply?: () => void;
};

/**
 * Reusable, accessible filter controls used in both desktop sidebar and mobile HeroUI Drawer.
 */
export function CatalogFilters({
  model,
  idPrefix = 'desktop',
  isMobileDrawer = false,
  onApply,
}: CatalogFiltersProps) {
  const activeCount = countActiveCatalogFilters(model);

  return (
    <form
      className={styles.filtersForm}
      action="/marketplace"
      method="get"
      role="search"
      aria-label="تصفية المنتجات"
      onSubmit={onApply}
    >
      <div className={styles.filterSection}>
        <label htmlFor={`${idPrefix}-search`} className={styles.filterLabel}>
          البحث في المنتجات
        </label>
        <input
          id={`${idPrefix}-search`}
          name="q"
          type="search"
          defaultValue={model.query}
          placeholder="اسم المنتج أو المتجر…"
          className={styles.field}
          autoComplete="off"
        />
      </div>

      <div className={styles.filterSection}>
        <label htmlFor={`${idPrefix}-category`} className={styles.filterLabel}>
          الفئة
        </label>
        <select
          id={`${idPrefix}-category`}
          name="category"
          defaultValue={model.selectedCategory ?? ''}
          className={styles.selectField}
        >
          <option value="">كل الفئات</option>
          {model.categories.map((category) => (
            <option key={category.id} value={category.slug}>
              {category.name} {typeof category.productCount === 'number' ? `(${category.productCount})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterSection}>
        <label htmlFor={`${idPrefix}-store`} className={styles.filterLabel}>
          المتجر
        </label>
        <select
          id={`${idPrefix}-store`}
          name="store"
          defaultValue={model.selectedStore ?? ''}
          className={styles.selectField}
        >
          <option value="">كل المتاجر</option>
          {model.stores.map((store) => (
            <option key={store.slug} value={store.slug}>
              {store.name} ({store.productCount})
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterSection}>
        <span className={styles.filterLabel}>نطاق السعر (جنيه)</span>
        <div className={styles.priceRangeGrid}>
          <div>
            <label htmlFor={`${idPrefix}-min-price`} className={styles.subLabel}>
              من
            </label>
            <input
              id={`${idPrefix}-min-price`}
              name="min_price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={model.minPrice}
              placeholder="0"
              className={styles.field}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-max-price`} className={styles.subLabel}>
              إلى
            </label>
            <input
              id={`${idPrefix}-max-price`}
              name="max_price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={model.maxPrice}
              placeholder="10000"
              className={styles.field}
            />
          </div>
        </div>
      </div>

      <div className={styles.filterSection}>
        <label htmlFor={`${idPrefix}-rating`} className={styles.filterLabel}>
          الحد الأدنى للتقييم
        </label>
        <select
          id={`${idPrefix}-rating`}
          name="rating"
          defaultValue={model.minRating ?? ''}
          className={styles.selectField}
        >
          <option value="">كل التقييمات</option>
          {[4, 3, 2, 1].map((rating) => (
            <option key={rating} value={rating}>
              ★ {rating} نجوم فأكثر
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterSection}>
        <label className={styles.checkboxLabel}>
          <input
            name="stock"
            value="1"
            type="checkbox"
            defaultChecked={model.inStockOnly}
            className={styles.checkbox}
          />
          <span>المتوفر في المخزن فقط</span>
        </label>
      </div>

      <div className={styles.filterSection}>
        <label htmlFor={`${idPrefix}-sort`} className={styles.filterLabel}>
          الترتيب حسب
        </label>
        <select
          id={`${idPrefix}-sort`}
          name="sort"
          defaultValue={model.selectedSort}
          className={styles.selectField}
        >
          {model.sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterActions}>
        <button type="submit" className={styles.primaryButton}>
          <Search className="size-4" aria-hidden="true" />
          تطبيق الفلاتر
        </button>
        {activeCount > 0 ? (
          <Link href="/marketplace" className={styles.secondaryButton}>
            <RotateCcw className="size-4" aria-hidden="true" />
            مسح الكل
          </Link>
        ) : null}
      </div>
    </form>
  );
}
