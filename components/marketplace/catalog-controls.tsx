import type { MarketplaceCatalogViewModel, MarketplaceSortOption, MarketplaceStoreFilter } from './view-models';
import { CatalogFilters } from './catalog-filters';

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
  categories?: { id: string; slug: string; name: string; productCount?: number }[];
};

/**
 * Backward-compatible wrapper delegating to the unified CatalogFilters component.
 */
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
  categories = [],
}: CatalogControlsProps) {
  const model: MarketplaceCatalogViewModel = {
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
    categories,
    products: [],
    hasMore: false,
    nextCursor: null,
  };

  return <CatalogFilters model={model} idPrefix="legacy-controls" />;
}
