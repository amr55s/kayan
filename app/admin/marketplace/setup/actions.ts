'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { egpToMinor } from '@/lib/commerce/money';
import { callMarketplaceSetupRpc, MarketplaceSetupError } from '@/lib/commerce/operational-setup';
import { requireAdminAal2 } from '@/lib/auth/guards';

function text(form: FormData, name: string): string {
  const value = form.get(name); return typeof value === 'string' ? value.trim() : '';
}
function nullable(value: string): string | null { return value || null; }
function errorCode(error: unknown): string {
  return error instanceof MarketplaceSetupError ? error.code : 'service_unavailable';
}
function date(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) throw new MarketplaceSetupError('invalid_input');
  return parsed.toISOString();
}
function integer(value: string, fallback: number, max: number): number | null {
  if (!value) return fallback;
  if (!/^\d{1,9}$/u.test(value)) throw new MarketplaceSetupError('invalid_input');
  const parsed = Number(value); if (parsed < 1 || parsed > max) throw new MarketplaceSetupError('invalid_input');
  return parsed;
}
function money(value: string): number | null { return value ? egpToMinor(value) : null; }
function refresh() { revalidatePath('/admin/marketplace/setup'); revalidatePath('/marketplace'); }

export async function saveAdminDeliveryZoneAction(form: FormData): Promise<void> {
  let destination = '/admin/marketplace/setup?notice=zone_saved';
  try {
    await requireAdminAal2({ failureMode: 'throw' });
    await callMarketplaceSetupRpc('save_marketplace_delivery_zone_as_admin', {
      p_zone_id: nullable(text(form, 'zoneId')), p_code: text(form, 'code'),
      p_name_ar: text(form, 'nameAr'), p_name_en: nullable(text(form, 'nameEn')),
      p_city: text(form, 'city'), p_sort_order: Number(text(form, 'sortOrder') || '0'),
      p_expected_updated_at: nullable(text(form, 'expectedUpdatedAt')),
      p_idempotency_key: randomUUID(),
    });
  } catch (error) { destination = `/admin/marketplace/setup?error=${errorCode(error)}`; }
  refresh(); redirect(destination);
}

export async function setAdminDeliveryZoneActiveAction(form: FormData): Promise<void> {
  let destination = '/admin/marketplace/setup?notice=zone_status_saved';
  try {
    await requireAdminAal2({ failureMode: 'throw' });
    await callMarketplaceSetupRpc('set_marketplace_delivery_zone_active_as_admin', {
      p_zone_id: text(form, 'zoneId'), p_is_active: text(form, 'nextActive') === 'true',
      p_expected_updated_at: text(form, 'expectedUpdatedAt'), p_idempotency_key: randomUUID(),
    });
  } catch (error) { destination = `/admin/marketplace/setup?error=${errorCode(error)}`; }
  refresh(); redirect(destination);
}

export async function saveAdminPlatformCouponAction(form: FormData): Promise<void> {
  let destination = '/admin/marketplace/setup?notice=coupon_saved';
  try {
    await requireAdminAal2({ failureMode: 'throw' });
    const type = text(form, 'discountType');
    if (type !== 'percentage' && type !== 'fixed') throw new MarketplaceSetupError('invalid_input');
    const percentRaw = text(form, 'discountPercent');
    const percent = percentRaw ? Number(percentRaw) : null;
    if (percent !== null && (!Number.isFinite(percent) || percent <= 0)) throw new MarketplaceSetupError('invalid_input');
    await callMarketplaceSetupRpc('save_platform_marketplace_coupon_as_admin', {
      p_coupon_id: nullable(text(form, 'couponId')), p_code: text(form, 'code').toUpperCase(),
      p_title: text(form, 'title'), p_discount_type: type,
      p_discount_percent: type === 'percentage' ? percent : null,
      p_discount_amount_piastres: type === 'fixed' ? money(text(form, 'discountAmountEgp')) : null,
      p_max_discount_piastres: money(text(form, 'maxDiscountEgp')),
      p_minimum_order_piastres: egpToMinor(text(form, 'minimumOrderEgp') || '0'),
      p_starts_at: date(text(form, 'startsAt')), p_expires_at: date(text(form, 'expiresAt')),
      p_total_limit: text(form, 'totalLimit') ? integer(text(form, 'totalLimit'), 1, 1_000_000) : null,
      p_per_customer_limit: integer(text(form, 'perCustomerLimit'), 1, 100),
      p_is_active: text(form, 'isActive') === 'on',
      p_expected_updated_at: nullable(text(form, 'expectedUpdatedAt')), p_idempotency_key: randomUUID(),
    });
  } catch (error) { destination = `/admin/marketplace/setup?error=${errorCode(error)}`; }
  refresh(); redirect(destination);
}

export async function deactivateAdminPlatformCouponAction(form: FormData): Promise<void> {
  let destination = '/admin/marketplace/setup?notice=coupon_deactivated';
  try {
    await requireAdminAal2({ failureMode: 'throw' });
    await callMarketplaceSetupRpc('deactivate_platform_marketplace_coupon_as_admin', {
      p_coupon_id: text(form, 'couponId'), p_expected_updated_at: text(form, 'expectedUpdatedAt'),
      p_idempotency_key: randomUUID(),
    });
  } catch (error) { destination = `/admin/marketplace/setup?error=${errorCode(error)}`; }
  refresh(); redirect(destination);
}
