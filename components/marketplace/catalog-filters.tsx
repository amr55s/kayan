'use client';

import { useRouter } from 'next/navigation';
import { DairtakLink } from '@/components/ui/dairtak-link';
import { DairtakSelect } from '@/components/ui/dairtak-select';
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
  onApply,
}: CatalogFiltersProps) {
  const router = useRouter();
  const activeCount = countActiveCatalogFilters(model);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const params = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          params.set(key, trimmed);
        }
      }
    }

    onApply?.();
    const queryString = params.toString();
    router.push(queryString ? `/marketplace?${queryString}` : '/marketplace');
  };

  return (
    <form
      key={JSON.stringify([model.query, model.selectedCategory, model.selectedStore, model.minPrice, model.maxPrice, model.minRating, model.inStockOnly, model.selectedSort])}
      className={styles.filtersForm}
      action="/marketplace"
      method="get"
      role="search"
      aria-label="تصفية المنتجات"
      onSubmit={handleSubmit}
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
        <DairtakSelect
          label="الفئة"
          name="category"
          defaultValue={model.selectedCategory ?? ''}
          options={[{ value: '', label: 'كل الفئات' }, ...model.categories.map((category) => ({ value: category.slug, label: `${category.name}${typeof category.productCount === 'number' ? ` (${category.productCount})` : ''}` }))]}
        />
      </div>

      <div className={styles.filterSection}>
        <DairtakSelect
          label="المتجر"
          name="store"
          defaultValue={model.selectedStore ?? ''}
          options={[{ value: '', label: 'كل المتاجر' }, ...model.stores.map((store) => ({ value: store.slug, label: `${store.name} (${store.productCount})` }))]}
        />
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
        <DairtakSelect
          label="الحد الأدنى للتقييم"
          name="rating"
          defaultValue={model.minRating ? String(model.minRating) : ''}
          options={[{ value: '', label: 'كل التقييمات' }, ...[4, 3, 2, 1].map((rating) => ({ value: String(rating), label: `${rating} نجوم فأكثر` }))]}
        />
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
        <DairtakSelect
          label="الترتيب حسب"
          name="sort"
          defaultValue={model.selectedSort}
          options={model.sortOptions}
        />
      </div>

      <div className={styles.filterActions}>
        <Button.Root type="submit" className={styles.primaryButton}>
          <Search className="size-4" aria-hidden="true" />
          تطبيق الفلاتر
        </Button.Root>
        {activeCount > 0 ? (
          <DairtakLink href="/marketplace" onClick={onApply} className={styles.secondaryButton}>
              <RotateCcw className="size-4" aria-hidden="true" />
              مسح الكل
            </DairtakLink>
        ) : null}
      </div>
    </form>
  );
}
