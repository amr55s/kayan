import { createChatLoginHref, sanitizeNextPath } from '../auth/safe-next.ts';

export function createSelectedStoreChatEntry(input: {
  model: {
    selectedStore: string | null;
    products: Array<{ id: string; store: { id: string; slug: string; name: string } }>;
  };
  returnTo: string;
  isAuthenticated: boolean;
}) {
  const product = input.model.selectedStore
    ? input.model.products.find((candidate) => candidate.store.slug === input.model.selectedStore)
    : null;
  if (!product) return null;
  const returnTo = sanitizeNextPath(input.returnTo);
  const intent = { kind: 'presale' as const, storeId: product.store.id, productId: null };
  return {
    intent,
    returnTo,
    isAuthenticated: input.isAuthenticated,
    storeName: product.store.name,
    loginHref: createChatLoginHref({ returnTo, intent }),
  };
}
