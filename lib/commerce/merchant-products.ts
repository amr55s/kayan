import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  MerchantCategoryAlias,
  MerchantCategoryOption,
  MerchantProductEditorViewModel,
  MerchantProductListViewModel,
  MerchantProductStatus,
  MerchantStockStatus,
  MerchantVariantEditorViewModel,
} from '@/components/marketplace/merchant/view-models';
import { databaseMinorToNumber, egpToMinor, minorToEgp } from '@/lib/commerce/money';
import { createClient } from '@/lib/supabase/server';

const uuid = z.uuid();
const timestamp = z.string().min(16).max(64);
const databaseMoney = z.union([
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^\d{1,14}$/u),
]);
const statusSchema = z.enum(['draft', 'pending_review', 'active', 'rejected', 'archived']);

const storeSchema = z.object({
  id: uuid,
  merchant_id: uuid,
  name: z.string().min(1).max(180),
});

const categorySchema = z.object({
  id: uuid,
  name_ar: z.string().min(1).max(120),
});

const categoryAliasSchema = z.object({
  category_id: uuid,
  phrase: z.string().min(2).max(120),
  normalized_phrase: z.string().min(2).max(120),
  match_scope: z.enum(['any', 'name', 'brand', 'description']),
  weight: z.number().int().min(1).max(100),
});

const listSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(100),
  offset: z.number().int().nonnegative(),
  items: z.array(z.object({
    id: uuid,
    store_id: uuid,
    product_key: z.string().min(1).max(80),
    name: z.string().min(1).max(200),
    brand: z.string().max(120).nullable(),
    status: statusSchema,
    category_name: z.string().max(120).nullable().optional(),
    moderation_notes: z.string().max(2_000).nullable().optional(),
    min_price_piastres: databaseMoney.nullable().optional(),
    max_price_piastres: databaseMoney.nullable().optional(),
    variant_count: z.number().int().nonnegative().optional(),
    active_variant_count: z.number().int().nonnegative().optional(),
    available_quantity: z.number().int().nonnegative().nullable().optional(),
    available_units: z.number().int().nonnegative().nullable().optional(),
    stock_status: z.enum(['in_stock', 'low_stock', 'out_of_stock', 'untracked', 'not_tracked']).optional(),
    thumbnail_url: z.url().nullable().optional(),
    primary_image_url: z.url().nullable().optional(),
    updated_at: timestamp,
  })).max(100),
});

const productSchema = z.object({
  id: uuid,
  store_id: uuid,
  category_id: uuid.nullable(),
  product_key: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  description: z.string().max(10_000).nullable(),
  brand: z.string().max(120).nullable(),
  status: statusSchema,
  first_published_at: timestamp.nullable(),
  moderation_notes: z.string().max(2_000).nullable(),
  pending_revision: z.object({
    id: uuid,
    status: z.literal('pending'),
    submitted_at: timestamp,
    proposed_snapshot: z.object({
      category_id: uuid.nullable(),
      product_key: z.string().min(1).max(80),
      slug: z.string().min(1).max(240),
      name: z.string().min(2).max(200),
      short_description: z.string().max(240).nullable(),
      description: z.string().min(1).max(10_000),
      brand: z.string().max(120).nullable(),
    }),
    images: z.array(z.object({
      asset_id: uuid,
      position: z.number().int().min(0).max(9),
      alt_text: z.string().max(240).nullable(),
      public_url: z.url(),
      updated_at: timestamp,
    })).min(1).max(10),
  }).nullable().optional(),
  updated_at: timestamp,
  images: z.array(z.object({
    asset_id: uuid,
    position: z.number().int().min(0).max(9),
    alt_text: z.string().max(240).nullable(),
    public_url: z.url(),
    updated_at: timestamp,
  })).max(10),
  variants: z.array(z.object({
    id: uuid,
    sku: z.string().min(1).max(80),
    barcode: z.string().max(64).nullable(),
    title: z.string().min(1).max(160),
    attributes: z.record(z.string(), z.unknown()),
    price_piastres: databaseMoney,
    compare_at_price_piastres: databaseMoney.nullable(),
    is_default: z.boolean(),
    is_active: z.boolean(),
    weight_grams: z.number().int().nonnegative().nullable(),
    on_hand: z.number().int().nonnegative().nullable(),
    reserved: z.number().int().nonnegative().nullable(),
    available: z.number().int().nonnegative().nullable(),
    track_inventory: z.boolean().nullable(),
    low_stock_threshold: z.number().int().nonnegative().nullable(),
    version: z.number().int().nonnegative().nullable(),
    updated_at: timestamp,
  })).max(100),
});

const mutationResponseSchema = productSchema.extend({ idempotent: z.boolean() });
const mediaDeletionSchema = z.array(z.object({
  undo_id: uuid,
  asset_id: uuid,
  expires_at: timestamp,
})).max(10);

const EXTERNAL_CONTACT = /(?:https?:\/\/|www\.|wa\.me|whatsapp|telegram|(?:^|\D)01[0125]\d{8}(?:\D|$))/iu;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class MerchantCatalogError extends Error {
  constructor(public readonly code: MerchantCatalogErrorCode) {
    super(code);
  }
}

export type MerchantCatalogErrorCode =
  | 'access_denied'
  | 'conflict'
  | 'invalid_input'
  | 'not_found'
  | 'service_unavailable';

type MerchantStoreContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  merchantId: string;
  storeId: string;
  storeName: string;
  categories: MerchantCategoryOption[];
  categoryAliases: MerchantCategoryAlias[];
};

function mapRpcError(error: { message?: string } | null): MerchantCatalogError {
  const message = error?.message ?? '';
  if (/access_required|authentication_required/u.test(message)) return new MerchantCatalogError('access_denied');
  if (/not_found/u.test(message)) return new MerchantCatalogError('not_found');
  if (/version_conflict|idempotency_conflict|already_archived/u.test(message)) return new MerchantCatalogError('conflict');
  if (/invalid_|required|duplicate|unique|inventory_below|image_limit|undo_expired/u.test(message)) {
    return new MerchantCatalogError('invalid_input');
  }
  return new MerchantCatalogError('service_unavailable');
}

export async function resolveMerchantStore(
  preferredStoreId?: string | null,
): Promise<MerchantStoreContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new MerchantCatalogError('access_denied');
  const [
    { data: stores, error: storeError },
    { data: categories, error: categoryError },
    { data: categoryAliases, error: categoryAliasError },
  ] = await Promise.all([
    (supabase as any).from('stores').select('id,merchant_id,name').order('created_at').limit(50),
    (supabase as any).from('product_categories').select('id,name_ar').eq('is_active', true).order('sort_order').limit(500),
    (supabase as any).from('product_category_aliases')
      .select('category_id,phrase,normalized_phrase,match_scope,weight')
      .eq('is_active', true)
      .limit(2_000),
  ]);
  if (storeError || categoryError || categoryAliasError) throw new MerchantCatalogError('service_unavailable');
  const parsedStores = z.array(storeSchema).safeParse(stores ?? []);
  const parsedCategories = z.array(categorySchema).safeParse(categories ?? []);
  const parsedAliases = z.array(categoryAliasSchema).safeParse(categoryAliases ?? []);
  if (!parsedStores.success || !parsedCategories.success || !parsedAliases.success) {
    throw new MerchantCatalogError('service_unavailable');
  }
  const selected = parsedStores.data.find((store) => store.id === preferredStoreId)
    ?? parsedStores.data[0];
  if (!selected) return null;
  return {
    supabase,
    merchantId: selected.merchant_id,
    storeId: selected.id,
    storeName: selected.name,
    categories: parsedCategories.data.map((category) => ({ id: category.id, name: category.name_ar })),
    categoryAliases: parsedAliases.data.map((alias) => ({
      categoryId: alias.category_id,
      phrase: alias.phrase,
      normalizedPhrase: alias.normalized_phrase,
      matchScope: alias.match_scope,
      weight: alias.weight,
    })),
  };
}

function listStockFilter(value: MerchantStockStatus | 'all'): string | null {
  if (value === 'all') return null;
  return value === 'not_tracked' ? 'untracked' : value;
}

export async function fetchMerchantProductList(input: {
  page: number;
  query: string;
  status: MerchantProductStatus | 'all';
  stock: MerchantStockStatus | 'all';
  storeId?: string | null;
}): Promise<MerchantProductListViewModel> {
  const context = await resolveMerchantStore(input.storeId);
  const page = Math.min(Math.max(input.page, 1), 1_000);
  const query = input.query.trim().slice(0, 100);
  if (!context) {
    return {
      loadState: { kind: 'empty', title: 'لا يوجد متجر مربوط', description: 'يجب اعتماد متجر وربطه بحسابك قبل إضافة المنتجات.' },
      store: null,
      products: [],
      filters: { query, status: input.status, stock: input.stock },
      pagination: { page: 1, pageCount: 1, totalResults: 0 },
    };
  }
  const pageSize = 30;
  const { data, error } = await (context.supabase as any).rpc('list_my_marketplace_products', {
    p_store_id: context.storeId,
    p_query: query || null,
    p_status: input.status === 'all' ? null : input.status,
    p_stock: listStockFilter(input.stock),
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw mapRpcError(error);
  const parsed = listSchema.safeParse(data);
  if (!parsed.success) throw new MerchantCatalogError('service_unavailable');
  const result = parsed.data;
  const products = result.items.map((item) => {
    const minimum = item.min_price_piastres == null ? null : databaseMinorToNumber(item.min_price_piastres);
    const maximum = item.max_price_piastres == null ? null : databaseMinorToNumber(item.max_price_piastres);
    const stock = item.stock_status === 'untracked' ? 'not_tracked' : item.stock_status ?? 'not_tracked';
    const thumbnail = item.thumbnail_url ?? item.primary_image_url ?? null;
    return {
      id: item.id,
      name: item.name,
      productKey: item.product_key,
      brand: item.brand,
      categoryName: item.category_name ?? null,
      status: item.status,
      stockStatus: stock as MerchantStockStatus,
      availableQuantity: item.available_quantity ?? item.available_units ?? null,
      variantCount: item.variant_count ?? item.active_variant_count ?? 0,
      minimumPrice: minimum == null ? null : { amountMinor: minimum, currency: 'EGP' as const },
      maximumPrice: maximum == null ? null : { amountMinor: maximum, currency: 'EGP' as const },
      thumbnail: thumbnail ? { id: `${item.id}:thumbnail`, url: thumbnail, alt: item.name } : null,
      moderationNote: item.moderation_notes ?? null,
      updatedAt: item.updated_at,
    };
  });
  return {
    loadState: products.length > 0
      ? { kind: 'ready' }
      : { kind: 'empty', title: 'لا توجد منتجات مطابقة', description: query || input.status !== 'all' || input.stock !== 'all' ? 'غيّر البحث أو عوامل التصفية.' : 'ابدأ بإنشاء أول منتج.' },
    store: { id: context.storeId, name: context.storeName },
    products,
    filters: { query, status: input.status, stock: input.stock },
    pagination: {
      page,
      pageCount: Math.max(1, Math.ceil(result.total / pageSize)),
      totalResults: result.total,
    },
  };
}

function mapVariant(value: z.infer<typeof productSchema>['variants'][number]): MerchantVariantEditorViewModel {
  const entries = Object.entries(value.attributes).filter(([, optionValue]) => typeof optionValue === 'string');
  const [first, second, ...extra] = entries as Array<[string, string]>;
  return {
    clientKey: value.id,
    id: value.id,
    title: value.title,
    sku: value.sku,
    barcode: value.barcode ?? '',
    weightGrams: value.weight_grams == null ? '' : String(value.weight_grams),
    option1Name: first?.[0] ?? '',
    option1Value: first?.[1] ?? '',
    option2Name: second?.[0] ?? '',
    option2Value: second?.[1] ?? '',
    priceEgp: minorToEgp(databaseMinorToNumber(value.price_piastres)),
    compareAtPriceEgp: value.compare_at_price_piastres == null ? '' : minorToEgp(databaseMinorToNumber(value.compare_at_price_piastres)),
    trackInventory: value.track_inventory ?? true,
    onHand: String(value.on_hand ?? 0),
    lowStockThreshold: String(value.low_stock_threshold ?? 0),
    isActive: value.is_active,
    extraAttributesJson: JSON.stringify(Object.fromEntries(extra)),
  };
}

export async function fetchMerchantProductEditor(
  productId: string,
): Promise<MerchantProductEditorViewModel | null> {
  if (!UUID_PATTERN.test(productId)) return null;
  const context = await resolveMerchantStore();
  if (!context) return null;
  const { data, error } = await (context.supabase as any).rpc('get_my_marketplace_product', {
    p_product_id: productId,
  });
  if (error) {
    const mapped = mapRpcError(error);
    if (mapped.code === 'not_found' || mapped.code === 'access_denied') return null;
    throw mapped;
  }
  const parsed = productSchema.safeParse(data);
  if (!parsed.success) throw new MerchantCatalogError('service_unavailable');
  const product = parsed.data;
  const proposed = product.pending_revision?.proposed_snapshot;
  const editorImages = product.pending_revision?.images ?? product.images;
  const [selectedStoreResult, deletionResult] = await Promise.all([
    (context.supabase as any)
      .from('stores')
      .select('id,merchant_id,name')
      .eq('id', product.store_id)
      .maybeSingle(),
    (context.supabase as any).rpc('list_my_marketplace_media_deletion_intents', {
      p_entity_type: 'product',
      p_entity_id: product.id,
    }),
  ]);
  const { data: selectedStoreData, error: selectedStoreError } = selectedStoreResult;
  const selectedStore = storeSchema.safeParse(selectedStoreData);
  const pendingDeletions = mediaDeletionSchema.safeParse(deletionResult.data);
  if (selectedStoreError || !selectedStore.success || deletionResult.error || !pendingDeletions.success) return null;
  return {
    mode: 'edit',
    productId: product.id,
    merchantId: selectedStore.data.merchant_id,
    storeId: product.store_id,
    storeName: selectedStore.data.name,
    productKey: proposed?.product_key ?? product.product_key,
    name: proposed?.name ?? product.name,
    brand: proposed?.brand ?? product.brand ?? '',
    categoryId: proposed?.category_id ?? product.category_id ?? '',
    description: proposed?.description ?? product.description ?? '',
    status: product.status,
    firstPublishedAt: product.first_published_at,
    moderationNote: product.moderation_notes,
    pendingRevision: product.pending_revision ? {
      id: product.pending_revision.id,
      submittedAt: product.pending_revision.submitted_at,
      imageCount: product.pending_revision.images.length,
    } : null,
    updatedAt: product.updated_at,
    idempotencyKey: randomUUID(),
    categories: context.categories,
    categoryAliases: context.categoryAliases,
    variants: product.variants.map(mapVariant),
    gallery: editorImages.map((image) => ({
      id: image.asset_id,
      url: image.public_url,
      alt: image.alt_text ?? product.name,
      position: image.position,
      state: 'ready' as const,
      updatedAt: image.updated_at,
    })),
    pendingMediaDeletions: pendingDeletions.data.map((deletion) => ({
      undoId: deletion.undo_id,
      assetId: deletion.asset_id,
      expiresAt: deletion.expires_at,
    })),
    canEdit: product.status !== 'pending_review' && product.status !== 'archived',
    canSubmitForReview: (product.status === 'draft' || product.status === 'rejected')
      && Boolean(product.description)
      && product.images.length > 0
      && product.variants.some((variant) => variant.is_active),
    feedback: { status: 'idle' },
  };
}

export async function createBlankMerchantProductEditor(
  storeId?: string | null,
): Promise<MerchantProductEditorViewModel> {
  const context = await resolveMerchantStore(storeId);
  return {
    mode: 'create',
    productId: null,
    merchantId: context?.merchantId ?? null,
    storeId: context?.storeId ?? null,
    storeName: context?.storeName ?? null,
    productKey: '',
    name: '',
    brand: '',
    categoryId: '',
    description: '',
    status: 'draft',
    firstPublishedAt: null,
    moderationNote: null,
    pendingRevision: null,
    updatedAt: null,
    idempotencyKey: randomUUID(),
    categories: context?.categories ?? [],
    categoryAliases: context?.categoryAliases ?? [],
    variants: [],
    gallery: [],
    pendingMediaDeletions: [],
    canEdit: Boolean(context),
    canSubmitForReview: false,
    feedback: { status: 'idle' },
  };
}

type ProductMutationInput = {
  storeId: string;
  productId: string | null;
  expectedUpdatedAt: string | null;
  idempotencyKey: string;
  product: Record<string, unknown>;
  variants: Array<Record<string, unknown>>;
  classification: {
    algorithmVersion: 'category-v1';
    predictedCategoryId: string | null;
    selectedCategoryId: string | null;
    confidence: number | null;
    signals: string[];
    proposedName: string | null;
  };
};

function stringValue(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function integer(value: string, minimum: number, maximum: number): number | null {
  if (!/^\d{1,10}$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function parseAttributes(form: FormData, prefix: string): Record<string, string> | null {
  const result: Record<string, string> = {};
  const field = (name: string) => `${prefix}${name}]`;
  const extraRaw = stringValue(form, field('extraAttributesJson'));
  if (extraRaw) {
    try {
      const extra = JSON.parse(extraRaw) as unknown;
      if (!extra || Array.isArray(extra) || typeof extra !== 'object') return null;
      for (const [key, value] of Object.entries(extra)) {
        if (!key.trim() || key.length > 80 || typeof value !== 'string' || value.length > 160) return null;
        result[key.trim()] = value.trim();
      }
    } catch { return null; }
  }
  for (const suffix of ['1', '2']) {
    const name = stringValue(form, field(`option${suffix}Name`));
    const value = stringValue(form, field(`option${suffix}Value`));
    if (Boolean(name) !== Boolean(value) || name.length > 80 || value.length > 160) return null;
    if (name) result[name] = value;
  }
  return result;
}

export function parseMerchantProductForm(form: FormData): ProductMutationInput | null {
  const storeId = stringValue(form, 'storeId');
  const productId = stringValue(form, 'productId') || null;
  const expectedUpdatedAt = stringValue(form, 'expectedUpdatedAt') || null;
  const idempotencyKey = stringValue(form, 'idempotencyKey');
  const name = stringValue(form, 'name');
  const description = stringValue(form, 'description');
  const brand = stringValue(form, 'brand');
  const categoryId = stringValue(form, 'categoryId');
  const providedKey = stringValue(form, 'productKey');
  const predictedCategoryId = stringValue(form, 'classificationPredictedCategoryId') || null;
  const confidenceRaw = stringValue(form, 'classificationConfidence');
  const proposedCategoryName = stringValue(form, 'proposedCategoryName') || null;
  let confidence: number | null = null;
  let signals: string[] = [];
  try {
    confidence = confidenceRaw ? Number(confidenceRaw) : null;
    const rawSignals = JSON.parse(stringValue(form, 'classificationSignals') || '[]') as unknown;
    if (!Array.isArray(rawSignals) || rawSignals.some((value) => typeof value !== 'string')) return null;
    signals = rawSignals.map((value) => value.slice(0, 160)).slice(0, 12);
  } catch { return null; }
  if (
    !UUID_PATTERN.test(storeId)
    || (productId !== null && !UUID_PATTERN.test(productId))
    || !UUID_PATTERN.test(idempotencyKey)
    || name.length < 2 || name.length > 200
    || description.length < 2 || description.length > 10_000
    || brand.length > 120
    || (categoryId && !UUID_PATTERN.test(categoryId))
    || (predictedCategoryId && !UUID_PATTERN.test(predictedCategoryId))
    || (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1))
    || (proposedCategoryName !== null && (proposedCategoryName.length < 2 || proposedCategoryName.length > 120))
    || (providedKey && (providedKey.length > 80 || /[\s\p{Cc}]/u.test(providedKey)))
    || EXTERNAL_CONTACT.test(description)
  ) return null;

  const variantIndexes = new Set<number>();
  for (const key of form.keys()) {
    const match = /^variants\[(\d{1,2})\]\[[A-Za-z0-9]+\]$/u.exec(key);
    if (match) variantIndexes.add(Number(match[1]));
  }
  const ordered = [...variantIndexes].sort((left, right) => left - right);
  if (!ordered.length || ordered.length > 50 || ordered.some((value, index) => value !== index)) return null;
  const variants: Array<Record<string, unknown>> = [];
  for (const index of ordered) {
    const prefix = `variants[${index}][`;
    const field = (name: string) => `${prefix}${name}]`;
    const id = stringValue(form, field('id')) || null;
    const title = stringValue(form, field('title'));
    const sku = stringValue(form, field('sku'));
    const barcode = stringValue(form, field('barcode')) || null;
    const weightRaw = stringValue(form, field('weightGrams'));
    const onHand = integer(stringValue(form, field('onHand')), 0, 1_000_000_000);
    const threshold = integer(stringValue(form, field('lowStockThreshold')), 0, 1_000_000_000);
    const trackInventoryRaw = stringValue(form, field('trackInventory'));
    const isActiveRaw = stringValue(form, field('isActive'));
    const attributes = parseAttributes(form, prefix);
    let price: number;
    let compareAt: number | null;
    try {
      price = egpToMinor(stringValue(form, field('priceEgp')));
      const compareRaw = stringValue(form, field('compareAtPriceEgp'));
      compareAt = compareRaw ? egpToMinor(compareRaw) : null;
    } catch { return null; }
    if (
      (id && !UUID_PATTERN.test(id)) || title.length < 1 || title.length > 160
      || sku.length < 1 || sku.length > 80 || barcode && (barcode.length < 4 || barcode.length > 64)
      || weightRaw && integer(weightRaw, 0, 100_000_000) == null
      || onHand == null || threshold == null || attributes == null
      || !['true', 'false'].includes(trackInventoryRaw) || !['true', 'false'].includes(isActiveRaw)
      || compareAt != null && compareAt < price
    ) return null;
    variants.push({
      id,
      sku,
      barcode,
      title,
      attributes,
      price_piastres: price,
      compare_at_price_piastres: compareAt,
      is_default: false,
      is_active: isActiveRaw === 'true',
      weight_grams: weightRaw ? Number(weightRaw) : null,
      on_hand: onHand,
      low_stock_threshold: threshold,
      track_inventory: trackInventoryRaw === 'true',
    });
  }
  const defaultIndex = variants.findIndex((variant) => variant.is_active === true);
  if (defaultIndex < 0) return null;
  variants[defaultIndex]!.is_default = true;
  const productKey = providedKey || `P-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  return {
    storeId,
    productId,
    expectedUpdatedAt,
    idempotencyKey,
    product: {
      category_id: categoryId || null,
      product_key: productKey,
      slug: productId ? undefined : `product-${randomUUID().replaceAll('-', '').slice(0, 16)}`,
      name,
      short_description: description.slice(0, 240),
      description,
      brand: brand || null,
      is_featured: false,
    },
    variants,
    classification: {
      algorithmVersion: 'category-v1',
      predictedCategoryId,
      selectedCategoryId: categoryId || null,
      confidence,
      signals,
      proposedName: proposedCategoryName,
    },
  };
}

export async function saveMerchantProduct(input: ProductMutationInput): Promise<string> {
  const context = await resolveMerchantStore(input.storeId);
  if (!context || context.storeId !== input.storeId) throw new MerchantCatalogError('access_denied');
  const rpc = input.productId ? 'update_my_marketplace_product' : 'create_my_marketplace_product';
  const args = input.productId ? {
    p_product_id: input.productId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_idempotency_key: input.idempotencyKey,
    p_product: input.product,
    p_variants: input.variants,
  } : {
    p_store_id: input.storeId,
    p_idempotency_key: input.idempotencyKey,
    p_product: input.product,
    p_variants: input.variants,
  };
  if (input.productId && !input.expectedUpdatedAt) throw new MerchantCatalogError('invalid_input');
  const { data, error } = await (context.supabase as any).rpc(rpc, args);
  if (error) throw mapRpcError(error);
  const parsed = mutationResponseSchema.safeParse(data);
  if (!parsed.success) throw new MerchantCatalogError('service_unavailable');
  const { error: classificationError } = await (context.supabase as any).rpc(
    'record_my_product_category_classification',
    {
      p_product_id: parsed.data.id,
      p_algorithm_version: input.classification.algorithmVersion,
      p_idempotency_key: input.idempotencyKey,
      p_predicted_category_id: input.classification.predictedCategoryId,
      p_selected_category_id: input.classification.selectedCategoryId,
      p_confidence: input.classification.confidence,
      p_signals: input.classification.signals,
      p_proposed_name: input.classification.proposedName,
    },
  );
  if (classificationError) throw mapRpcError(classificationError);
  return parsed.data.id;
}

async function callMerchantProductRpc(
  productId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<void> {
  if (!UUID_PATTERN.test(productId)) throw new MerchantCatalogError('invalid_input');
  const context = await resolveMerchantStore();
  if (!context) throw new MerchantCatalogError('access_denied');
  const { error } = await (context.supabase as any).rpc(name, args);
  if (error) throw mapRpcError(error);
}

export function submitMerchantProductForReview(productId: string) {
  return callMerchantProductRpc(productId, 'submit_my_product_for_review', { p_product_id: productId });
}

export function archiveMerchantProduct(input: { productId: string; expectedUpdatedAt: string; idempotencyKey: string }) {
  if (!timestamp.safeParse(input.expectedUpdatedAt).success || !UUID_PATTERN.test(input.idempotencyKey)) {
    throw new MerchantCatalogError('invalid_input');
  }
  return callMerchantProductRpc(input.productId, 'archive_my_marketplace_product', {
    p_product_id: input.productId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_idempotency_key: input.idempotencyKey,
  });
}

export function reorderMerchantProductMedia(input: {
  productId: string;
  storeId: string;
  orderedAssetIds: string[];
  expectedUpdatedAt: string;
}) {
  if (
    !UUID_PATTERN.test(input.storeId) || !timestamp.safeParse(input.expectedUpdatedAt).success
    || input.orderedAssetIds.length < 1 || input.orderedAssetIds.length > 10
    || new Set(input.orderedAssetIds).size !== input.orderedAssetIds.length
    || input.orderedAssetIds.some((id) => !UUID_PATTERN.test(id))
  ) throw new MerchantCatalogError('invalid_input');
  return callMerchantProductRpc(input.productId, 'reorder_my_marketplace_media', {
    p_store_id: input.storeId,
    p_entity_type: 'product',
    p_entity_id: input.productId,
    p_ordered_asset_ids: input.orderedAssetIds,
    p_expected_entity_updated_at: input.expectedUpdatedAt,
  });
}

export function deleteMerchantProductMedia(input: {
  productId: string;
  assetId: string;
  expectedAssetUpdatedAt: string;
}) {
  if (!UUID_PATTERN.test(input.assetId) || !timestamp.safeParse(input.expectedAssetUpdatedAt).success) {
    throw new MerchantCatalogError('invalid_input');
  }
  return callMerchantProductRpc(input.productId, 'delete_my_marketplace_media', {
    p_asset_id: input.assetId,
    p_expected_asset_updated_at: input.expectedAssetUpdatedAt,
  });
}

export function undoMerchantProductMediaDeletion(input: {
  productId: string;
  undoId: string;
}) {
  if (!UUID_PATTERN.test(input.undoId)) throw new MerchantCatalogError('invalid_input');
  return callMerchantProductRpc(input.productId, 'undo_my_marketplace_media_deletion', {
    p_undo_id: input.undoId,
  });
}
