import Link from 'next/link';
import { RotateCcw, Search } from 'lucide-react';
import { Button } from '@heroui/react/button';
import { Checkbox } from '@heroui/react/checkbox';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
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
        <Label.Root htmlFor={`${idPrefix}-search`} className={styles.filterLabel}>
          البحث في المنتجات
        </Label.Root>
        <Input.Root
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
            <Label.Root htmlFor={`${idPrefix}-min-price`} className={styles.subLabel}>
              من
            </Label.Root>
            <Input.Root
              id={`${idPrefix}-min-price`}
              name="min_price"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              defaultValue={model.minPrice}
              placeholder="0"
              className={styles.field}
            />
          </div>
          <div>
            <Label.Root htmlFor={`${idPrefix}-max-price`} className={styles.subLabel}>
              إلى
            </Label.Root>
            <Input.Root
              id={`${idPrefix}-max-price`}
              name="max_price"
              type="number"
              min={0}
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
        <Checkbox.Root
          name="stock"
          value="1"
          defaultSelected={model.inStockOnly}
          className={styles.checkboxLabel}
        >
          <Checkbox.Content>
            <Checkbox.Control />
            <span>المتوفر في المخزن فقط</span>
          </Checkbox.Content>
        </Checkbox.Root>
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
        <Button.Root type="submit" className={styles.primaryButton}>
          <Search className="size-4" aria-hidden="true" />
          تطبيق الفلاتر
        </Button.Root>
        {activeCount > 0 ? (
          <Link href="/marketplace">
            <Button.Root className={styles.secondaryButton}>
              <RotateCcw className="size-4" aria-hidden="true" />
              مسح الكل
            </Button.Root>
          </Link>
        ) : null}
      </div>
    </form>
  );
}
