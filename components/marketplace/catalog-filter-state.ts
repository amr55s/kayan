import type { MarketplaceCatalogViewModel } from './view-models';

/**
 * Computes the number of non-default active search and filter constraints.
 */
export function countActiveCatalogFilters(model: MarketplaceCatalogViewModel): number {
  let count = 0;
  if (model.query && model.query.trim().length > 0) count += 1;
  if (model.selectedCategory) count += 1;
  if (model.selectedStore) count += 1;
  if (model.minPrice && model.minPrice.trim().length > 0) count += 1;
  if (model.maxPrice && model.maxPrice.trim().length > 0) count += 1;
  if (model.inStockOnly) count += 1;
  if (model.minRating && model.minRating > 0) count += 1;
  if (model.selectedSort && model.selectedSort !== 'recommended' && model.selectedSort !== 'newest') count += 1;
  return count;
}
