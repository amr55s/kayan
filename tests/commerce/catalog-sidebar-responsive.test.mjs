import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { countActiveCatalogFilters } from '../../components/marketplace/catalog-filter-state.ts';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

function sampleCatalogModel(overrides = {}) {
  return {
    query: '',
    selectedCategory: null,
    selectedStore: null,
    selectedSort: 'recommended',
    sortOptions: [
      { value: 'recommended', label: 'المقترح' },
      { value: 'newest', label: 'الأحدث' },
      { value: 'price_asc', label: 'السعر: الأقل أولًا' },
    ],
    stores: [
      { id: 's1', slug: 'store-1', name: 'متجر الأزياء', productCount: 12 },
    ],
    categories: [
      { id: 'c1', slug: 'clothes', name: 'ملابس', productCount: 8 },
    ],
    minPrice: '',
    maxPrice: '',
    inStockOnly: false,
    minRating: null,
    products: [],
    hasMore: false,
    nextCursor: null,
    ...overrides,
  };
}

test('countActiveCatalogFilters accurately counts non-default search and filter constraints', () => {
  // Empty default model -> 0 active filters
  assert.equal(countActiveCatalogFilters(sampleCatalogModel()), 0);

  // Single filters
  assert.equal(countActiveCatalogFilters(sampleCatalogModel({ query: 'قميص' })), 1);
  assert.equal(countActiveCatalogFilters(sampleCatalogModel({ selectedCategory: 'clothes' })), 1);
  assert.equal(countActiveCatalogFilters(sampleCatalogModel({ selectedStore: 'store-1' })), 1);
  assert.equal(countActiveCatalogFilters(sampleCatalogModel({ minPrice: '100' })), 1);
  assert.equal(countActiveCatalogFilters(sampleCatalogModel({ maxPrice: '500' })), 1);
  assert.equal(countActiveCatalogFilters(sampleCatalogModel({ inStockOnly: true })), 1);
  assert.equal(countActiveCatalogFilters(sampleCatalogModel({ minRating: 4 })), 1);
  assert.equal(countActiveCatalogFilters(sampleCatalogModel({ selectedSort: 'price_asc' })), 1);

  // Multiple active filters combined
  assert.equal(
    countActiveCatalogFilters(sampleCatalogModel({
      query: 'حذاء',
      selectedCategory: 'shoes',
      selectedStore: 'store-1',
      minPrice: '200',
      maxPrice: '1000',
      inStockOnly: true,
      minRating: 4,
      selectedSort: 'price_asc',
    })),
    8,
  );
});

test('desktop catalog composes a persistent sticky sidebar with all filter controls', () => {
  const catalogView = read('components/marketplace/catalog-view.tsx');
  const catalogFilters = read('components/marketplace/catalog-filters.tsx');

  // Semantic landmark
  assert.match(catalogView, /<aside[^>]*aria-label="تصفية المنتجات"/);
  assert.match(catalogView, /<CatalogFilters\s+model=\{model\}\s+idPrefix="desktop"/);

  // All 7 required filter inputs in shared component
  assert.match(catalogFilters, /name="q"/);
  assert.match(catalogFilters, /name="category"/);
  assert.match(catalogFilters, /name="store"/);
  assert.match(catalogFilters, /name="min_price"/);
  assert.match(catalogFilters, /name="max_price"/);
  assert.match(catalogFilters, /name="rating"/);
  assert.match(catalogFilters, /name="stock"/);
  assert.match(catalogFilters, /name="sort"/);
  assert.match(catalogFilters, /type="submit"[^>]*>[\s\S]*تطبيق الفلاتر/);
  assert.match(catalogFilters, /href="\/marketplace"[^>]*>[\s\S]*مسح الكل/);
});

test('mobile catalog integrates HeroUI Drawer with active counter badge and safe areas', () => {
  const catalogView = read('components/marketplace/catalog-view.tsx');

  // Trigger button & badge
  assert.match(catalogView, /styles\.mobileFilterBar/);
  assert.match(catalogView, /styles\.mobileFilterButton/);
  assert.match(catalogView, /تصفية المنتجات/);
  assert.match(catalogView, /activeCount > 0/);

  // HeroUI Drawer integration
  assert.match(catalogView, /<Drawer\s+state=\{mobileDrawerState\}/);
  assert.match(catalogView, /<Drawer\.Backdrop/);
  assert.match(catalogView, /<Drawer\.Dialog[^>]*dir="rtl"/);
  assert.match(catalogView, /<Drawer\.Heading/);
  assert.match(catalogView, /pb-\[calc\(1rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(catalogView, /<CatalogFilters[\s\S]*isMobileDrawer[\s\S]*onApply=/);
});

test('marketplace CSS enforces responsive sidebar layout and logical properties', () => {
  const css = read('components/marketplace/marketplace.module.css');

  // Desktop grid layout
  assert.match(css, /\.catalogLayout\s*\{[\s\S]*grid-template-columns:\s*minmax\(14rem,\s*17\.5rem\)\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /\.catalogSidebar\s*\{[\s\S]*position:\s*sticky/);
  assert.match(css, /\.catalogSidebar\s*\{[\s\S]*inset-block-start:\s*5rem/);
  assert.match(css, /\.catalogSidebar\s*\{[\s\S]*overscroll-behavior:\s*contain/);

  // Mobile collapsing (< 768px / 47.99rem)
  assert.match(css, /@media\s*\(max-width:\s*47\.99rem\)\s*\{[\s\S]*\.catalogSidebar\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /@media\s*\(max-width:\s*47\.99rem\)\s*\{[\s\S]*\.mobileFilterBar\s*\{\s*display:\s*flex;\s*\}/);
  assert.match(css, /@media\s*\(max-width:\s*47\.99rem\)\s*\{[\s\S]*\.catalogLayout\s*\{\s*grid-template-columns:\s*1fr;\s*\}/);
});
