'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { egpToMinor } from '@/lib/commerce/money';
import {
  callMarketplaceSetupRpc,
  deleteMyMarketplaceStoreMedia,
  MarketplaceSetupError,
  reorderMyMarketplaceStoreMedia,
  undoMyMarketplaceStoreMediaDeletion,
} from '@/lib/commerce/operational-setup';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function nullable(value: string): string | null { return value || null; }
function key(form: FormData): string {
  const value = text(form, 'idempotencyKey');
  return UUID.test(value) ? value : randomUUID();
}
function errorCode(error: unknown): string {
  return error instanceof MarketplaceSetupError ? error.code : 'service_unavailable';
}
function date(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new MarketplaceSetupError('invalid_input');
  return parsed.toISOString();
}
function positiveInteger(value: string, fallback: number, max: number): number | null {
  if (!value) return fallback;
  if (!/^\d{1,9}$/u.test(value)) throw new MarketplaceSetupError('invalid_input');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new MarketplaceSetupError('invalid_input');
  return parsed;
}
function optionalMoney(value: string): number | null { return value ? egpToMinor(value) : null; }
function nonNegativeInteger(value: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!/^\d{1,15}$/u.test(value)) throw new MarketplaceSetupError('invalid_input');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) {
    throw new MarketplaceSetupError('invalid_input');
  }
  return parsed;
}
function boundedInteger(value: string, min: number, max: number): number {
  if (!/^-?\d{1,6}$/u.test(value)) throw new MarketplaceSetupError('invalid_input');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new MarketplaceSetupError('invalid_input');
  }
  return parsed;
}

function refresh() {
  revalidatePath('/merchant/marketplace');
  revalidatePath('/merchant/marketplace/settings');
  revalidatePath('/merchant/marketplace/coupons');
  revalidatePath('/marketplace');
}

export async function createMarketplaceStoreAction(form: FormData): Promise<void> {
  let destination = '/merchant/marketplace/settings?notice=store_created';
  try {
    await callMarketplaceSetupRpc('create_my_marketplace_store', {
      p_merchant_id: text(form, 'merchantId'), p_name: text(form, 'name'),
      p_slug: text(form, 'slug'), p_short_description: nullable(text(form, 'shortDescription')),
      p_description: nullable(text(form, 'description')), p_city: nullable(text(form, 'city')),
      p_area: nullable(text(form, 'area')), p_address_text: nullable(text(form, 'addressText')),
      p_idempotency_key: key(form),
    });
  } catch (error) { destination = `/merchant/marketplace/settings?error=${errorCode(error)}`; }
  refresh(); redirect(destination);
}

export async function updateMarketplaceStoreAction(form: FormData): Promise<void> {
  const storeId = text(form, 'storeId');
  let destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&notice=store_updated`;
  try {
    await callMarketplaceSetupRpc('update_my_marketplace_store', {
      p_store_id: storeId, p_name: text(form, 'name'),
      p_short_description: nullable(text(form, 'shortDescription')),
      p_description: nullable(text(form, 'description')), p_city: nullable(text(form, 'city')),
      p_area: nullable(text(form, 'area')), p_address_text: nullable(text(form, 'addressText')),
      p_expected_updated_at: text(form, 'expectedUpdatedAt'), p_idempotency_key: key(form),
    });
  } catch (error) { destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&error=${errorCode(error)}`; }
  refresh(); redirect(destination);
}

export async function submitMarketplaceStoreAction(form: FormData): Promise<void> {
  const storeId = text(form, 'storeId');
  let destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&notice=store_submitted`;
  try { await callMarketplaceSetupRpc('submit_my_marketplace_store_operational', { p_store_id: storeId, p_idempotency_key: key(form) }); }
  catch (error) { destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&error=${errorCode(error)}`; }
  refresh(); redirect(destination);
}

export async function saveStoreDeliveryConfigurationAction(form: FormData): Promise<void> {
  const storeId = text(form, 'storeId');
  let destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&notice=delivery_saved`;
  try {
    const etaMin = positiveInteger(text(form, 'etaMin'), 30, 10_080);
    const etaMax = positiveInteger(text(form, 'etaMax'), 60, 10_080);
    if (etaMin === null || etaMax === null || etaMax < etaMin) throw new MarketplaceSetupError('invalid_input');
    await callMarketplaceSetupRpc('save_my_store_delivery_configuration', {
      p_store_id: storeId, p_zone_id: text(form, 'zoneId'),
      p_delivery_mode: text(form, 'deliveryMode'), p_fee_piastres: egpToMinor(text(form, 'feeEgp') || '0'),
      p_free_delivery_threshold_piastres: optionalMoney(text(form, 'freeThresholdEgp')),
      p_minimum_order_piastres: egpToMinor(text(form, 'minimumOrderEgp') || '0'),
      p_estimated_minutes_min: etaMin, p_estimated_minutes_max: etaMax,
      p_is_active: text(form, 'isActive') === 'on',
      p_expected_store_updated_at: text(form, 'expectedStoreUpdatedAt'),
      p_expected_config_updated_at: nullable(text(form, 'expectedConfigUpdatedAt')),
      p_idempotency_key: key(form),
    });
  } catch (error) { destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&error=${errorCode(error)}`; }
  refresh(); redirect(destination);
}

export async function saveStoreBranchAction(form: FormData): Promise<void> {
  const storeId = text(form, 'storeId');
  let destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&notice=branch_saved`;
  try {
    const modes = form.getAll('deliveryModes').filter((value): value is string => (
      value === 'platform' || value === 'self'
    ));
    if (modes.length < 1 || modes.length !== new Set(modes).size) {
      throw new MarketplaceSetupError('invalid_input');
    }
    await callMarketplaceSetupRpc('save_my_store_branch', {
      p_store_id: storeId,
      p_branch_id: nullable(text(form, 'branchId')),
      p_code: text(form, 'code'),
      p_name: text(form, 'name'),
      p_city: nullable(text(form, 'city')),
      p_area: nullable(text(form, 'area')),
      p_address_text: text(form, 'addressText'),
      p_delivery_modes: modes,
      p_status: text(form, 'status'),
      p_is_default: text(form, 'isDefault') === 'on',
      p_sort_order: boundedInteger(text(form, 'sortOrder') || '0', -10_000, 10_000),
      p_expected_version: nonNegativeInteger(text(form, 'expectedVersion') || '0'),
      p_idempotency_key: key(form),
    });
  } catch (error) {
    destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&error=${errorCode(error)}`;
  }
  refresh(); redirect(destination);
}

export async function deleteStoreBranchAction(form: FormData): Promise<void> {
  const storeId = text(form, 'storeId');
  let destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&notice=branch_deactivated`;
  try {
    await callMarketplaceSetupRpc('delete_my_store_branch', {
      p_store_id: storeId,
      p_branch_id: text(form, 'branchId'),
      p_expected_version: nonNegativeInteger(text(form, 'expectedVersion')),
      p_idempotency_key: key(form),
    });
  } catch (error) {
    destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&error=${errorCode(error)}`;
  }
  refresh(); redirect(destination);
}

export async function saveBranchDeliveryConfigurationAction(form: FormData): Promise<void> {
  const storeId = text(form, 'storeId');
  let destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&notice=branch_delivery_saved`;
  try {
    const etaMin = positiveInteger(text(form, 'etaMin'), 30, 10_080);
    const etaMax = positiveInteger(text(form, 'etaMax'), 60, 10_080);
    if (etaMin === null || etaMax === null || etaMax < etaMin) {
      throw new MarketplaceSetupError('invalid_input');
    }
    await callMarketplaceSetupRpc('save_my_branch_delivery_configuration', {
      p_store_id: storeId,
      p_branch_id: text(form, 'branchId'),
      p_zone_id: text(form, 'zoneId'),
      p_delivery_mode: text(form, 'deliveryMode'),
      p_fee_piastres: egpToMinor(text(form, 'feeEgp') || '0'),
      p_free_delivery_threshold_piastres: optionalMoney(text(form, 'freeThresholdEgp')),
      p_minimum_order_piastres: egpToMinor(text(form, 'minimumOrderEgp') || '0'),
      p_estimated_minutes_min: etaMin,
      p_estimated_minutes_max: etaMax,
      p_is_active: text(form, 'isActive') === 'on',
      p_expected_branch_version: nonNegativeInteger(text(form, 'expectedBranchVersion')),
      p_expected_config_version: nonNegativeInteger(text(form, 'expectedConfigVersion') || '0'),
      p_idempotency_key: key(form),
    });
  } catch (error) {
    destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&error=${errorCode(error)}`;
  }
  refresh(); redirect(destination);
}

export async function reorderMarketplaceStoreImagesAction(form: FormData): Promise<void> {
  const storeId = text(form, 'storeId');
  let destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&notice=store_images_reordered`;
  try {
    const assetIds = JSON.parse(text(form, 'orderedAssetIds')) as unknown;
    if (!Array.isArray(assetIds) || assetIds.some((assetId) => typeof assetId !== 'string')) {
      throw new MarketplaceSetupError('invalid_input');
    }
    await reorderMyMarketplaceStoreMedia({
      storeId,
      orderedAssetIds: assetIds,
      expectedUpdatedAt: text(form, 'expectedEntityUpdatedAt'),
    });
  } catch (error) {
    destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&error=${errorCode(error)}`;
  }
  refresh(); redirect(destination);
}

export async function deleteMarketplaceStoreImageAction(form: FormData): Promise<void> {
  const storeId = text(form, 'storeId');
  let destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&notice=store_image_deleted`;
  try {
    await deleteMyMarketplaceStoreMedia({
      storeId,
      assetId: text(form, 'assetId'),
      expectedAssetUpdatedAt: text(form, 'expectedAssetUpdatedAt'),
    });
  } catch (error) {
    destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&error=${errorCode(error)}`;
  }
  refresh(); redirect(destination);
}

export async function undoMarketplaceStoreImageDeletionAction(form: FormData): Promise<void> {
  const storeId = text(form, 'storeId');
  let destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&notice=store_image_restored`;
  try {
    await undoMyMarketplaceStoreMediaDeletion({
      storeId,
      undoId: text(form, 'undoId'),
    });
  } catch (error) {
    destination = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}&error=${errorCode(error)}`;
  }
  refresh(); redirect(destination);
}

function couponParams(form: FormData) {
  const type = text(form, 'discountType');
  if (type !== 'percentage' && type !== 'fixed') throw new MarketplaceSetupError('invalid_input');
  const percentRaw = text(form, 'discountPercent');
  const percent = percentRaw ? Number(percentRaw) : null;
  if (percent !== null && (!Number.isFinite(percent) || percent <= 0)) throw new MarketplaceSetupError('invalid_input');
  return {
    p_coupon_id: nullable(text(form, 'couponId')), p_code: text(form, 'code').toUpperCase(),
    p_title: text(form, 'title'), p_discount_type: type,
    p_discount_percent: type === 'percentage' ? percent : null,
    p_discount_amount_piastres: type === 'fixed' ? optionalMoney(text(form, 'discountAmountEgp')) : null,
    p_max_discount_piastres: optionalMoney(text(form, 'maxDiscountEgp')),
    p_minimum_order_piastres: egpToMinor(text(form, 'minimumOrderEgp') || '0'),
    p_starts_at: date(text(form, 'startsAt')), p_expires_at: date(text(form, 'expiresAt')),
    p_total_limit: text(form, 'totalLimit') ? positiveInteger(text(form, 'totalLimit'), 1, 1_000_000) : null,
    p_per_customer_limit: positiveInteger(text(form, 'perCustomerLimit'), 1, 100),
    p_is_active: text(form, 'isActive') === 'on', p_expected_updated_at: nullable(text(form, 'expectedUpdatedAt')),
    p_idempotency_key: key(form),
  };
}

export async function saveMerchantMarketplaceCouponAction(form: FormData): Promise<void> {
  const storeId = text(form, 'storeId');
  let destination = `/merchant/marketplace/coupons?store=${encodeURIComponent(storeId)}&notice=coupon_saved`;
  try { await callMarketplaceSetupRpc('save_my_marketplace_coupon', { p_store_id: storeId, ...couponParams(form) }); }
  catch (error) { destination = `/merchant/marketplace/coupons?store=${encodeURIComponent(storeId)}&error=${errorCode(error)}`; }
  refresh(); redirect(destination);
}

export async function deactivateMerchantMarketplaceCouponAction(form: FormData): Promise<void> {
  const storeId = text(form, 'storeId');
  let destination = `/merchant/marketplace/coupons?store=${encodeURIComponent(storeId)}&notice=coupon_deactivated`;
  try {
    await callMarketplaceSetupRpc('deactivate_my_marketplace_coupon', {
      p_coupon_id: text(form, 'couponId'), p_expected_updated_at: text(form, 'expectedUpdatedAt'),
      p_idempotency_key: key(form),
    });
  } catch (error) { destination = `/merchant/marketplace/coupons?store=${encodeURIComponent(storeId)}&error=${errorCode(error)}`; }
  refresh(); redirect(destination);
}
