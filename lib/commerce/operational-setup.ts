import 'server-only';

import { z } from 'zod';
import { databaseMinorToNumber } from '@/lib/commerce/money';
import { createClient } from '@/lib/supabase/server';

const uuid = z.uuid();
const timestamp = z.string().min(16).max(64);
const databaseMoney = z.union([z.number().int().nonnegative(), z.string().regex(/^\d{1,14}$/u)]);
const storeImageSchema = z.object({
  asset_id: uuid,
  public_url: z.url(),
  position: z.number().int().min(0).max(14),
  alt_text: z.string().max(240).nullable(),
  kind: z.enum(['logo', 'cover', 'gallery']),
  updated_at: timestamp,
});
const mediaDeletionSchema = z.object({ undo_id: uuid, asset_id: uuid, expires_at: timestamp });

const storeSchema = z.object({
  id: uuid,
  merchant_id: uuid,
  name: z.string().min(2).max(150),
  slug: z.string().min(1).max(80),
  short_description: z.string().nullable(),
  description: z.string().nullable(),
  status: z.enum(['draft', 'pending_review', 'published', 'suspended', 'archived']),
  delivery_mode: z.enum(['platform', 'self', 'flexible']),
  city: z.string().nullable(),
  area: z.string().nullable(),
  address_text: z.string().nullable(),
  moderation_notes: z.string().nullable(),
  updated_at: timestamp,
  pending_revision: z.object({
    id: uuid,
    submitted_at: timestamp,
    image_count: z.number().int().min(0).max(15),
  }).nullable().optional(),
  images: z.array(storeImageSchema).max(15).default([]),
  pending_media_deletions: z.array(mediaDeletionSchema).max(15).default([]),
});

const merchantSchema = z.object({ id: uuid, name: z.string().min(2).max(150) });
const zoneSchema = z.object({
  id: uuid,
  code: z.string().min(2).max(40),
  name_ar: z.string().min(2).max(120),
  name_en: z.string().nullable(),
  city: z.string().min(2).max(120),
  sort_order: z.number().int(),
  is_active: z.boolean(),
  updated_at: timestamp,
});
const deliveryConfigSchema = z.object({
  store_id: uuid,
  delivery_mode: z.enum(['platform', 'self', 'flexible']),
  store_updated_at: timestamp,
  zones: z.array(z.object({
    zone_id: uuid,
    code: z.string(),
    name_ar: z.string(),
    city: z.string(),
    zone_is_active: z.boolean(),
    delivery_mode: z.enum(['platform', 'self']).nullable(),
    fee_piastres: databaseMoney.nullable(),
    free_delivery_threshold_piastres: databaseMoney.nullable(),
    minimum_order_piastres: databaseMoney.nullable(),
    estimated_minutes_min: z.number().int().nullable(),
    estimated_minutes_max: z.number().int().nullable(),
    is_active: z.boolean(),
    updated_at: timestamp.nullable(),
  })).max(500),
});
const branchZoneSchema = z.object({
  zone_id: uuid,
  code: z.string().min(2).max(40),
  name_ar: z.string().min(2).max(120),
  city: z.string().min(2).max(120),
  zone_is_active: z.boolean(),
  delivery_mode: z.enum(['platform', 'self']),
  fee_piastres: databaseMoney,
  free_delivery_threshold_piastres: databaseMoney.nullable(),
  minimum_order_piastres: databaseMoney,
  estimated_minutes_min: z.number().int().min(1).max(10_080),
  estimated_minutes_max: z.number().int().min(1).max(10_080),
  is_active: z.boolean(),
  version: z.coerce.number().int().positive(),
  updated_at: timestamp,
});
const branchSchema = z.object({
  id: uuid,
  store_id: uuid,
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(120),
  city: z.string().nullable(),
  area: z.string().nullable(),
  address_text: z.string().min(2).max(500),
  status: z.enum(['active', 'inactive']),
  delivery_modes: z.array(z.enum(['platform', 'self'])).min(1).max(2),
  is_default: z.boolean(),
  sort_order: z.number().int().min(-10_000).max(10_000),
  version: z.coerce.number().int().positive(),
  updated_at: timestamp,
  zones: z.array(branchZoneSchema).max(1_000),
});
const couponSchema = z.object({
  id: uuid,
  store_id: uuid.nullable(),
  code: z.string().min(3).max(32),
  title: z.string().min(2).max(120),
  discount_type: z.enum(['percentage', 'fixed']),
  funding_owner: z.enum(['merchant', 'platform']),
  discount_percent: z.union([z.number(), z.string()]).nullable(),
  discount_amount_piastres: databaseMoney.nullable(),
  max_discount: databaseMoney.nullable(),
  minimum_order: databaseMoney,
  starts_at: timestamp.nullable(),
  expires_at: timestamp.nullable(),
  total_limit: z.number().int().nullable(),
  per_customer_limit: z.number().int(),
  redeemed_count: z.number().int().nonnegative(),
  is_active: z.boolean(),
  updated_at: timestamp,
});

export class MarketplaceSetupError extends Error {
  constructor(public readonly code: MarketplaceSetupErrorCode) { super(code); }
}

export type MarketplaceSetupErrorCode =
  | 'access_denied' | 'conflict' | 'invalid_input' | 'limit_reached'
  | 'not_found' | 'service_unavailable' | 'slug_taken';

function mapError(error: { message?: string } | null): MarketplaceSetupError {
  const message = error?.message ?? '';
  if (/access_required|authentication_required/u.test(message)) return new MarketplaceSetupError('access_denied');
  if (/version_conflict|idempotency_conflict/u.test(message)) return new MarketplaceSetupError('conflict');
  if (/not_found/u.test(message)) return new MarketplaceSetupError('not_found');
  if (/slug_taken|stores_slug_key/u.test(message)) return new MarketplaceSetupError('slug_taken');
  if (/limit_reached|rate_limited/u.test(message)) return new MarketplaceSetupError('limit_reached');
  if (/invalid_|unavailable|not_editable|not_store_wide|undo_expired/u.test(message)) return new MarketplaceSetupError('invalid_input');
  return new MarketplaceSetupError('service_unavailable');
}

async function rpc<T>(name: string, params: Record<string, unknown> | undefined, schema: z.ZodType<T>): Promise<T> {
  const supabase = await createClient();
  const result = await (supabase as any).rpc(name, params);
  if (result.error) throw mapError(result.error);
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw new MarketplaceSetupError('service_unavailable');
  return parsed.data;
}

export type MarketplaceStore = z.infer<typeof storeSchema>;
export type MarketplaceDeliveryConfiguration = z.infer<typeof deliveryConfigSchema>;
export type MarketplaceDeliveryZone = z.infer<typeof zoneSchema>;
export type MarketplaceStoreBranch = z.infer<typeof branchSchema>;
export type MarketplaceCoupon = z.infer<typeof couponSchema> & {
  discountAmountMinor: number | null;
  maxDiscountMinor: number | null;
  minimumOrderMinor: number;
};

export async function listMyMarketplaceStores(): Promise<MarketplaceStore[]> {
  return rpc('list_my_marketplace_stores', undefined, z.array(storeSchema).max(50));
}

export async function listMyManageableMerchants() {
  return rpc('list_my_manageable_merchants', undefined, z.array(merchantSchema).max(20));
}

export async function getMerchantOperationalSetup(preferredStoreId?: string | null) {
  const [stores, merchants] = await Promise.all([listMyMarketplaceStores(), listMyManageableMerchants()]);
  const selected = stores.find((store) => store.id === preferredStoreId) ?? stores[0] ?? null;
  if (!selected) return { stores, merchants, selected: null, delivery: null, branches: [] as MarketplaceStoreBranch[], coupons: [] as MarketplaceCoupon[] };
  const [delivery, branches, coupons, media, pendingDeletions] = await Promise.all([
    rpc('list_my_store_delivery_configuration', { p_store_id: selected.id }, deliveryConfigSchema),
    rpc('list_my_store_branches', { p_store_id: selected.id }, z.array(branchSchema).max(50)),
    listMarketplaceCoupons(selected.id, false),
    rpc('get_my_marketplace_store_media', { p_store_id: selected.id }, z.array(storeImageSchema).max(15)),
    rpc('list_my_marketplace_media_deletion_intents', {
      p_entity_type: 'store', p_entity_id: selected.id,
    }, z.array(mediaDeletionSchema).max(15)),
  ]);
  const selectedWithMedia: MarketplaceStore = {
    ...selected,
    images: media,
    pending_media_deletions: pendingDeletions,
  };
  return {
    stores: stores.map((store) => store.id === selected.id ? selectedWithMedia : store),
    merchants,
    selected: selectedWithMedia,
    delivery,
    branches,
    coupons,
  };
}

export async function getAdminOperationalSetup() {
  const [zones, coupons] = await Promise.all([
    rpc('list_marketplace_delivery_zones_for_admin', undefined, z.array(zoneSchema).max(500)),
    listMarketplaceCoupons(null, true),
  ]);
  return { zones, coupons };
}

async function listMarketplaceCoupons(storeId: string | null, admin: boolean): Promise<MarketplaceCoupon[]> {
  const rows = admin
    ? await rpc('list_platform_marketplace_coupons_as_admin', undefined, z.array(couponSchema).max(500))
    : await rpc('list_my_marketplace_coupons', { p_store_id: storeId }, z.array(couponSchema).max(500));
  return rows.map((coupon) => ({
    ...coupon,
    discountAmountMinor: coupon.discount_amount_piastres == null ? null : databaseMinorToNumber(coupon.discount_amount_piastres),
    maxDiscountMinor: coupon.max_discount == null ? null : databaseMinorToNumber(coupon.max_discount),
    minimumOrderMinor: databaseMinorToNumber(coupon.minimum_order),
  }));
}

export async function callMarketplaceSetupRpc(name: string, params: Record<string, unknown>): Promise<void> {
  await rpc(name, params, z.object({ id: uuid }).passthrough());
}

export async function reorderMyMarketplaceStoreMedia(input: {
  storeId: string;
  orderedAssetIds: string[];
  expectedUpdatedAt: string;
}): Promise<void> {
  if (
    !uuid.safeParse(input.storeId).success
    || !timestamp.safeParse(input.expectedUpdatedAt).success
    || input.orderedAssetIds.length < 1
    || input.orderedAssetIds.length > 15
    || new Set(input.orderedAssetIds).size !== input.orderedAssetIds.length
    || input.orderedAssetIds.some((assetId) => !uuid.safeParse(assetId).success)
  ) throw new MarketplaceSetupError('invalid_input');
  await rpc('reorder_my_marketplace_media', {
    p_store_id: input.storeId,
    p_entity_type: 'store',
    p_entity_id: input.storeId,
    p_ordered_asset_ids: input.orderedAssetIds,
    p_expected_entity_updated_at: input.expectedUpdatedAt,
  }, z.object({}).passthrough());
}

export async function deleteMyMarketplaceStoreMedia(input: {
  storeId: string;
  assetId: string;
  expectedAssetUpdatedAt: string;
}): Promise<void> {
  if (
    !uuid.safeParse(input.storeId).success
    || !uuid.safeParse(input.assetId).success
    || !timestamp.safeParse(input.expectedAssetUpdatedAt).success
  ) throw new MarketplaceSetupError('invalid_input');
  await rpc('delete_my_marketplace_media', {
    p_asset_id: input.assetId,
    p_expected_asset_updated_at: input.expectedAssetUpdatedAt,
  }, z.object({}).passthrough());
}

export async function undoMyMarketplaceStoreMediaDeletion(input: {
  storeId: string;
  undoId: string;
}): Promise<void> {
  if (!uuid.safeParse(input.storeId).success || !uuid.safeParse(input.undoId).success) {
    throw new MarketplaceSetupError('invalid_input');
  }
  await rpc('undo_my_marketplace_media_deletion', {
    p_undo_id: input.undoId,
  }, z.object({}).passthrough());
}
