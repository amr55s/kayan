import { MarketplaceCatalog } from '@/components/marketplace/catalog-view';
import { fetchMarketplaceCatalog } from '@/lib/commerce/catalog';

export const dynamic = 'force-dynamic';

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawRating = Number.parseInt(single(params.rating) ?? '', 10);
  const model = await fetchMarketplaceCatalog({
    category: single(params.category),
    cursor: single(params.cursor),
    inStock: single(params.stock) === '1',
    maxPrice: single(params.max_price),
    minPrice: single(params.min_price),
    minRating: Number.isInteger(rawRating) ? rawRating : null,
    query: single(params.q),
    sort: single(params.sort),
    store: single(params.store),
  });

  return <MarketplaceCatalog model={model} />;
}
