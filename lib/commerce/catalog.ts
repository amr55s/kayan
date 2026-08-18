import 'server-only';

import { z } from 'zod';
import type {
  MarketplaceCatalogViewModel,
  MarketplaceProductDetailsViewModel,
  MarketplaceProductSummary,
} from '@/components/marketplace/view-models';
import { databaseMinorToNumber } from '@/lib/commerce/money';
import { logSafeServerFailure } from '@/lib/observability/server-log';
import { createPublicClient } from '@/lib/supabase/public';

const uuid = z.uuid();
const databaseMoney = z.union([
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^\d{1,14}$/u),
]);
const databaseRating = z.union([
  z.number().finite().min(1).max(5),
  z.string().regex(/^[1-5](?:\.\d{1,2})?$/u),
]);
const nullableMoney = databaseMoney.nullable();

const storeSchema = z.object({
  id: uuid,
  slug: z.string().min(1).max(180),
  name: z.string().min(1).max(180),
  short_description: z.string().max(240).nullish(),
});

const ratingSchema = z.object({
  average: databaseRating,
  count: z.number().int().positive(),
}).nullable();

const catalogItemSchema = z.object({
  id: uuid,
  slug: z.string().min(1).max(180),
  name: z.string().min(1).max(200),
  short_description: z.string().max(240).nullish(),
  brand: z.string().max(120).nullish(),
  store: storeSchema,
  category: z.object({
    id: uuid,
    slug: z.string(),
    name_ar: z.string(),
    name_en: z.string().nullish(),
  }).nullable(),
  default_variant: z.object({
    id: uuid,
    title: z.string(),
    price: databaseMoney,
    compare_at_price: nullableMoney,
  }),
  min_price: databaseMoney,
  available: z.boolean().nullable(),
  max_quantity: z.number().int().min(0).max(99).nullable(),
  primary_image_url: z.url().nullable(),
  rating: ratingSchema,
});

const catalogResponseSchema = z.object({
  items: z.array(catalogItemSchema),
  has_more: z.boolean(),
  next_cursor: z.object({
    sort: z.union([z.number(), z.string()]),
    available: z.number().int().min(0).max(1),
    rating: z.union([z.number(), z.string()]),
    quality: z.union([z.number(), z.string()]),
    sales: z.union([z.number().int().nonnegative(), z.string()]),
    created_at: z.iso.datetime({ offset: true }),
    id: uuid,
  }).nullable(),
  categories: z.array(z.object({
    slug: z.string().min(1),
    name_ar: z.string().min(1),
    name_en: z.string().nullish(),
    count: z.number().int().nonnegative(),
  })),
  stores: z.array(z.object({
    slug: z.string().min(1).max(180),
    name: z.string().min(1).max(180),
    count: z.number().int().nonnegative(),
  })),
});

const cursorSchema = catalogResponseSchema.shape.next_cursor.unwrap();

const productResponseSchema = z.object({
  id: uuid,
  slug: z.string().min(1).max(180),
  name: z.string().min(1).max(200),
  description: z.string().max(10_000).nullish(),
  brand: z.string().max(120).nullish(),
  store: storeSchema,
  category: z.object({
    id: uuid,
    slug: z.string(),
    name_ar: z.string(),
    name_en: z.string().nullish(),
  }).nullable(),
  images: z.array(z.object({
    id: uuid,
    url: z.url(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    alt_text: z.string().max(240).nullish(),
    position: z.number().int().min(0).max(9),
  })).max(10),
  variants: z.array(z.object({
    id: uuid,
    title: z.string().min(1).max(160),
    sku: z.string().min(1).max(80),
    attributes: z.record(z.string(), z.unknown()),
    price: databaseMoney,
    compare_at_price: nullableMoney,
    is_default: z.boolean(),
    available: z.boolean(),
    max_quantity: z.number().int().min(0).max(99),
  })).min(1),
  rating: z.object({
    average: databaseRating,
    count: z.number().int().positive(),
    distribution: z.record(z.string(), z.number().int().nonnegative()),
  }).nullable(),
});

export const marketplaceCatalogSorts = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'relevance', label: 'الأكثر صلة' },
  { value: 'price_asc', label: 'السعر: من الأقل' },
  { value: 'price_desc', label: 'السعر: من الأعلى' },
  { value: 'rating_desc', label: 'الأعلى تقييمًا' },
] as const;

export type MarketplaceCatalogSort = (typeof marketplaceCatalogSorts)[number]['value'];

function isCatalogSort(value: string): value is MarketplaceCatalogSort {
  return marketplaceCatalogSorts.some((option) => option.value === value);
}

function image(id: string, url: string, alt: string) {
  return { id, url, alt };
}

function mapCatalogItem(row: z.infer<typeof catalogItemSchema>): MarketplaceProductSummary {
  const minPrice = databaseMinorToNumber(row.min_price);
  const defaultPrice = databaseMinorToNumber(row.default_variant.price);
  const compareAt = row.default_variant.compare_at_price == null
    ? null
    : databaseMinorToNumber(row.default_variant.compare_at_price);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    store: {
      id: row.store.id,
      name: row.store.name,
      slug: row.store.slug,
      isVerified: true,
    },
    defaultVariantId: row.default_variant.id,
    primaryImage: row.primary_image_url
      ? image(`${row.id}:primary`, row.primary_image_url, row.name)
      : null,
    price: { amountMinor: minPrice, currency: 'EGP' },
    compareAtPrice: compareAt != null && defaultPrice === minPrice
      ? { amountMinor: compareAt, currency: 'EGP' }
      : null,
    rating: row.rating
      ? { average: Number(row.rating.average), count: row.rating.count }
      : null,
    isInStock: Boolean(row.available && (row.max_quantity ?? 0) > 0),
    fulfillmentLabel: row.available ? 'متاح للطلب والدفع عند الاستلام' : null,
  };
}

export async function fetchMarketplaceCatalog(input: {
  category?: string | null;
  cursor?: string | null;
  inStock?: boolean;
  maxPrice?: string;
  minPrice?: string;
  minRating?: number | null;
  query?: string;
  sort?: string;
  store?: string | null;
}): Promise<MarketplaceCatalogViewModel> {
  const query = input.query?.trim().slice(0, 100) ?? '';
  const category = input.category?.trim().slice(0, 120) || null;
  const store = input.store?.trim().slice(0, 180) || null;
  const sort = isCatalogSort(input.sort ?? '')
    ? input.sort as MarketplaceCatalogSort
    : query
      ? 'relevance'
      : 'newest';
  const parsePrice = (value: string | undefined): { input: string; minor: number | null } => {
    const normalized = value?.trim() ?? '';
    if (!/^\d{1,7}(?:\.\d{1,2})?$/u.test(normalized)) return { input: '', minor: null };
    const [whole, fraction = ''] = normalized.split('.');
    const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return Number.isSafeInteger(minor) ? { input: normalized, minor } : { input: '', minor: null };
  };
  const minPrice = parsePrice(input.minPrice);
  const maxPrice = parsePrice(input.maxPrice);
  const minRating = Number.isInteger(input.minRating) && input.minRating! >= 1 && input.minRating! <= 5
    ? input.minRating!
    : null;
  let cursor: z.infer<typeof cursorSchema> | null = null;
  if (input.cursor && input.cursor.length <= 2_048) {
    try {
      const candidate = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
      const parsedCursor = cursorSchema.safeParse(candidate);
      if (parsedCursor.success) cursor = parsedCursor.data;
    } catch {
      cursor = null;
    }
  }
  const supabase = createPublicClient();
  const { data, error } = await (supabase as any).rpc('list_marketplace_catalog_v2', {
    p_query: query || null,
    p_category_slug: category,
    p_store_slug: store,
    p_min_price: minPrice.minor,
    p_max_price: maxPrice.minor,
    p_in_stock: input.inStock ? true : null,
    p_min_rating: minRating,
    p_sort: sort,
    p_cursor: cursor,
    p_limit: 24,
  });
  if (error) throw new Error(`marketplace_catalog_query_failed:${error.code ?? 'unknown'}`);
  const parsed = catalogResponseSchema.safeParse(data);
  if (!parsed.success) {
    logSafeServerFailure('error', 'marketplace_catalog_contract_invalid', {
      failure: 'contract_validation_failed',
    });
    throw new Error('marketplace_catalog_contract_invalid');
  }
  const value = parsed.data;
  return {
    products: value.items.map(mapCatalogItem),
    categories: value.categories.map((item) => ({
      id: item.slug,
      slug: item.slug,
      name: item.name_ar,
      productCount: item.count,
    })),
    stores: value.stores.map((item) => ({
      slug: item.slug,
      name: item.name,
      productCount: item.count,
    })),
    sortOptions: marketplaceCatalogSorts.map((option) => ({ ...option })),
    query,
    selectedCategory: category,
    selectedStore: store,
    selectedSort: sort,
    minPrice: minPrice.input,
    maxPrice: maxPrice.input,
    inStockOnly: Boolean(input.inStock),
    minRating,
    nextCursor: value.next_cursor
      ? Buffer.from(JSON.stringify(value.next_cursor), 'utf8').toString('base64url')
      : null,
    hasMore: value.has_more,
  };
}

export async function fetchMarketplaceProduct(
  productId: string,
): Promise<MarketplaceProductDetailsViewModel | null> {
  if (!uuid.safeParse(productId).success) return null;
  const supabase = createPublicClient();
  const { data, error } = await (supabase as any).rpc('get_marketplace_product', {
    p_product_id: productId,
  });
  if (error) throw new Error(`marketplace_product_query_failed:${error.code ?? 'unknown'}`);
  if (data == null) return null;
  const parsed = productResponseSchema.safeParse(data);
  if (!parsed.success) {
    logSafeServerFailure('error', 'marketplace_product_contract_invalid', {
      failure: 'contract_validation_failed',
    });
    throw new Error('marketplace_product_contract_invalid');
  }
  const value = parsed.data;
  const orderedVariants = [...value.variants].sort((left, right) =>
    Number(right.available) - Number(left.available)
    || Number(right.is_default) - Number(left.is_default),
  );
  const selected = orderedVariants[0]!;
  const images = value.images.map((asset) => image(
    asset.id,
    asset.url,
    asset.alt_text || value.name,
  ));
  const details: MarketplaceProductDetailsViewModel = {
    id: value.id,
    slug: value.slug,
    name: value.name,
    store: {
      id: value.store.id,
      name: value.store.name,
      slug: value.store.slug,
      isVerified: true,
    },
    defaultVariantId: selected.id,
    primaryImage: images[0] ?? null,
    images,
    price: { amountMinor: databaseMinorToNumber(selected.price), currency: 'EGP' },
    compareAtPrice: selected.compare_at_price == null
      ? null
      : { amountMinor: databaseMinorToNumber(selected.compare_at_price), currency: 'EGP' },
    rating: value.rating
      ? { average: Number(value.rating.average), count: value.rating.count }
      : null,
    isInStock: orderedVariants.some((variant) => variant.available && variant.max_quantity > 0),
    description: value.description || null,
    highlights: [],
    variants: orderedVariants.map((variant) => ({
      id: variant.id,
      label: variant.title,
      price: { amountMinor: databaseMinorToNumber(variant.price), currency: 'EGP' },
      isInStock: variant.available && variant.max_quantity > 0,
      availableQuantity: variant.max_quantity,
    })),
    maxQuantityPerOrder: Math.max(1, ...orderedVariants.map((variant) => variant.max_quantity)),
    deliveryNote: 'الدفع نقدًا عند الاستلام، وتظهر رسوم التوصيل بعد اختيار المنطقة.',
    returnPolicyNote: 'يمكن طلب الإرجاع من صفحة الطلب، وتتم مراجعته داخل الموقع.',
  };
  return details;
}
