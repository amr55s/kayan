import { MarketplaceCatalog } from '@/components/marketplace/catalog-view';
import { fetchMarketplaceCatalog } from '@/lib/commerce/catalog';
import { createSelectedStoreChatEntry } from '@/lib/commerce/store-chat';
import { sanitizeNextPath } from '@/lib/auth/safe-next';
import { createClient } from '@/lib/supabase/server';
import type { ChatRecoveryCode } from '@/components/marketplace/chat/chat-entry-state';

export const dynamic = 'force-dynamic';

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

const catalogKeys = ['q', 'sort', 'store', 'min_price', 'max_price', 'stock', 'rating', 'category', 'cursor'] as const;

function catalogReturnTo(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const key of catalogKeys) {
    const value = single(params[key]);
    if (value) query.set(key, value);
  }
  return sanitizeNextPath(`/marketplace${query.size ? `?${query.toString()}` : ''}`);
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
  const matchingStoreProduct = model.selectedStore
    ? model.products.find((product) => product.store.slug === model.selectedStore)
    : null;
  let storeChat = null;
  if (matchingStoreProduct) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    storeChat = createSelectedStoreChatEntry({
      model,
      returnTo: catalogReturnTo(params),
      isAuthenticated: Boolean(user),
    });
    const recoveryValue = single(params.chat_recovery);
    const recovery: ChatRecoveryCode | null = recoveryValue === 'authentication_required'
      || recoveryValue === 'rate_limited'
      || recoveryValue === 'service_unavailable'
      || recoveryValue === 'profile_setup'
      ? recoveryValue
      : null;
    if (storeChat && recovery) storeChat = { ...storeChat, recovery };
  }

  return <MarketplaceCatalog model={model} storeChat={storeChat} />;
}
