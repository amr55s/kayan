import assert from 'node:assert/strict';
import test from 'node:test';
import { countActiveCatalogFilters } from '../../components/marketplace/catalog-filter-state.ts';
import { resolveCheckoutEntryState } from '../../components/marketplace/checkout-state.ts';
import { formatMarketplaceMoney, marketplaceDiscountPercentage } from '../../components/marketplace/format.ts';

test('Catalog interaction: countActiveCatalogFilters correctly handles edge-case permutations', () => {
  const baseModel = {
    query: '',
    selectedCategory: null,
    selectedStore: null,
    minPrice: '',
    maxPrice: '',
    inStockOnly: false,
    minRating: null,
    selectedSort: 'recommended',
    categories: [],
    stores: [],
    sortOptions: [],
    products: [],
    totalResults: 0,
    hasMore: false,
    nextCursor: null,
  };

  assert.equal(countActiveCatalogFilters(baseModel), 0);

  // Single active filters
  assert.equal(countActiveCatalogFilters({ ...baseModel, query: '   ' }), 0, 'Whitespace query should not count');
  assert.equal(countActiveCatalogFilters({ ...baseModel, query: 'قهوة' }), 1);
  assert.equal(countActiveCatalogFilters({ ...baseModel, selectedCategory: 'electronics' }), 1);
  assert.equal(countActiveCatalogFilters({ ...baseModel, selectedStore: 'store-1' }), 1);
  assert.equal(countActiveCatalogFilters({ ...baseModel, minPrice: '10' }), 1);
  assert.equal(countActiveCatalogFilters({ ...baseModel, maxPrice: '500' }), 1);
  assert.equal(countActiveCatalogFilters({ ...baseModel, inStockOnly: true }), 1);
  assert.equal(countActiveCatalogFilters({ ...baseModel, minRating: 4 }), 1);
  assert.equal(countActiveCatalogFilters({ ...baseModel, selectedSort: 'price_asc' }), 1);
  assert.equal(countActiveCatalogFilters({ ...baseModel, selectedSort: 'newest' }), 0, 'Default sort should not count');

  // All 7 active filters combined
  const fullModel = {
    ...baseModel,
    query: 'تمر',
    selectedCategory: 'food',
    selectedStore: 'store-a',
    minPrice: '50',
    maxPrice: '300',
    inStockOnly: true,
    minRating: 4,
    selectedSort: 'price_desc',
  };
  assert.equal(countActiveCatalogFilters(fullModel), 8);
});

test('Checkout state resolution: resolveCheckoutEntryState safely redirects unauthenticated guests when required', () => {
  assert.deepEqual(resolveCheckoutEntryState(true), { mode: 'google' });
  assert.deepEqual(resolveCheckoutEntryState(false), { mode: 'checkout' });
});

test('Price formatting and discounts: formatMarketplaceMoney handles edge cases gracefully', () => {
  const zero = formatMarketplaceMoney({ amountMinor: 0, currency: 'EGP' });
  assert.ok(zero.includes('ج.م') || zero.includes('EGP'));

  const fractional = formatMarketplaceMoney({ amountMinor: 15050, currency: 'EGP' });
  assert.ok(fractional.includes('150.5') || fractional.includes('١٥٠٫٥'));

  // Discount percentage edge cases
  assert.equal(marketplaceDiscountPercentage({ amountMinor: 8000, currency: 'EGP' }, { amountMinor: 10000, currency: 'EGP' }), 20);
  assert.equal(marketplaceDiscountPercentage({ amountMinor: 10000, currency: 'EGP' }, { amountMinor: 10000, currency: 'EGP' }), null);
  assert.equal(marketplaceDiscountPercentage({ amountMinor: 12000, currency: 'EGP' }, { amountMinor: 10000, currency: 'EGP' }), null);
  assert.equal(marketplaceDiscountPercentage({ amountMinor: 8000, currency: 'EGP' }, null), null);
});
