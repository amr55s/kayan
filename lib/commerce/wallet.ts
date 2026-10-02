import 'server-only';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const WALLET_PROOF_BUCKET = 'wallet-topup-proofs';
export const WALLET_PROOF_MAX_BYTES = 3 * 1024 * 1024;

export type WalletErrorCode =
  | 'access_denied'
  | 'already_reviewed'
  | 'authentication_required'
  | 'insufficient_balance'
  | 'invalid_input'
  | 'not_found'
  | 'notes_required'
  | 'pending_limit'
  | 'plan_unavailable'
  | 'proof_required'
  | 'schema_unavailable'
  | 'service_unavailable';

export class WalletError extends Error {
  constructor(public readonly code: WalletErrorCode) {
    super(code);
  }
}

const uuid = z.uuid();
const timestamp = z.string().min(16).max(64);
const money = z.coerce.number().int().min(-99_999_999_999).max(99_999_999_999);
const count = z.coerce.number().int().nonnegative();

function mapError(error: { code?: string; message?: string } | null): WalletError {
  const message = error?.message ?? '';
  if (/authentication_required/u.test(message)) return new WalletError('authentication_required');
  if (/wallet_access_required|store_access_required|admin_role_required/u.test(message)) return new WalletError('access_denied');
  if (/wallet_balance_insufficient/u.test(message)) return new WalletError('insufficient_balance');
  if (/topup_proof_required/u.test(message)) return new WalletError('proof_required');
  if (/topup_pending_limit_reached/u.test(message)) return new WalletError('pending_limit');
  if (/topup_already_reviewed/u.test(message)) return new WalletError('already_reviewed');
  if (/topup_rejection_notes_required/u.test(message)) return new WalletError('notes_required');
  if (/subscription_plan_unavailable/u.test(message)) return new WalletError('plan_unavailable');
  if (/topup_not_found|wallet_merchant_not_found/u.test(message)) return new WalletError('not_found');
  if (/invalid_|topup_amount_invalid|topup_payer_invalid/u.test(message)) return new WalletError('invalid_input');
  // PostgREST reports a function that the database does not have yet.
  if (error?.code === 'PGRST202' || error?.code === '42883') return new WalletError('schema_unavailable');
  return new WalletError('service_unavailable');
}

async function rpc<T>(name: string, params: Record<string, unknown> | undefined, schema: z.ZodType<T>): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc(name, params);
  if (error) throw mapError(error);
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new WalletError('service_unavailable');
  return parsed.data;
}

export const walletEntryTypes = [
  'topup', 'order_fee', 'free_order', 'subscription_order', 'subscription_purchase', 'adjustment',
] as const;
export type WalletEntryType = (typeof walletEntryTypes)[number];
export type WalletTopupStatus = 'pending' | 'approved' | 'rejected';

const feeSchema = z.object({
  fixed_piastres: money,
  percent_bps: count,
  max_piastres: money.nullable(),
  minimum_topup_piastres: money,
});

const walletSchema = z.object({
  merchant_id: uuid,
  merchant_name: z.string().max(200).nullable(),
  balance_piastres: money,
  free_orders_total: count,
  free_orders_used: count,
  free_orders_remaining: count,
  subscription: z.object({ plan_name: z.string().max(120).nullable(), ends_at: timestamp }).nullable(),
  fee: feeSchema,
  payment: z.object({
    recipient_name: z.string().max(120).nullable(),
    instapay_handle: z.string().max(120).nullable(),
    phone: z.string().max(20).nullable(),
  }),
  plans: z.array(z.object({
    id: uuid, name: z.string().max(120), duration_days: count, price_piastres: money,
  })).max(50),
  entries: z.array(z.object({
    id: uuid,
    type: z.enum(walletEntryTypes),
    amount_piastres: money,
    balance_after_piastres: money,
    order_id: uuid.nullable(),
    order_code: z.string().max(64).nullable(),
    note: z.string().max(500).nullable(),
    created_at: timestamp,
  })).max(50),
  topups: z.array(z.object({
    id: uuid,
    public_code: z.string().max(40),
    amount_piastres: money,
    payer_name: z.string().max(120),
    status: z.enum(['pending', 'approved', 'rejected']),
    review_notes: z.string().max(1_000).nullable(),
    created_at: timestamp,
    reviewed_at: timestamp.nullable(),
  })).max(20),
});
export type MerchantWallet = z.infer<typeof walletSchema>;

export async function getMyMerchantWallet(merchantId?: string | null): Promise<MerchantWallet> {
  return rpc('get_my_merchant_wallet', {
    p_merchant_id: merchantId && uuid.safeParse(merchantId).success ? merchantId : null,
  }, walletSchema);
}

/** The orders-per-fee sentence shown wherever the merchant meets the fee. */
export function describeOrderFee(fee: { fixed_piastres: number; percent_bps: number; max_piastres?: number | null }): string {
  const parts: string[] = [];
  if (fee.fixed_piastres > 0) parts.push(`${(fee.fixed_piastres / 100).toLocaleString('ar-EG')} جنيه`);
  if (fee.percent_bps > 0) parts.push(`${(fee.percent_bps / 100).toLocaleString('ar-EG')}٪ من قيمة المنتجات`);
  if (parts.length === 0) return 'بدون رسوم حاليًا';
  const cap = fee.max_piastres != null ? `، بحد أقصى ${(fee.max_piastres / 100).toLocaleString('ar-EG')} جنيه` : '';
  return `${parts.join(' + ')} لكل طلب تقبله${cap}`;
}

export async function createMyWalletTopupRequest(input: {
  merchantId: string;
  amountPiastres: number;
  payerName: string;
  payerPhone: string;
  transferReference: string | null;
  proofPath: string;
  idempotencyKey: string;
}): Promise<void> {
  await rpc('create_my_wallet_topup_request', {
    p_merchant_id: input.merchantId,
    p_amount_piastres: input.amountPiastres,
    p_payer_name: input.payerName,
    p_payer_phone: input.payerPhone,
    p_transfer_reference: input.transferReference,
    p_proof_path: input.proofPath,
    p_idempotency_key: input.idempotencyKey,
  }, z.object({ id: uuid }).passthrough());
}

export async function purchaseMyWalletSubscription(input: {
  merchantId: string; planId: string; idempotencyKey: string;
}): Promise<void> {
  await rpc('purchase_my_wallet_subscription', {
    p_merchant_id: input.merchantId, p_plan_id: input.planId, p_idempotency_key: input.idempotencyKey,
  }, z.object({ idempotent: z.boolean() }).passthrough());
}

const storeContactSchema = z.object({
  phone: z.string().max(20), whatsapp: z.string().max(20).nullable(),
}).nullable();
export type StoreContact = z.infer<typeof storeContactSchema>;

export async function getMyStoreContact(storeId: string): Promise<StoreContact> {
  return rpc('get_my_store_contact', { p_store_id: storeId }, storeContactSchema);
}

export async function saveMyStoreContact(input: { storeId: string; phone: string; whatsapp: string | null }): Promise<void> {
  await rpc('save_my_store_contact', {
    p_store_id: input.storeId, p_phone: input.phone, p_whatsapp: input.whatsapp,
  }, z.object({ phone: z.string() }).passthrough());
}

const checklistSchema = z.object({
  store_status: z.string().max(40),
  products_total: count,
  products_active: count,
  has_contact: z.boolean(),
  has_delivery: z.boolean(),
  awaiting_orders: count,
  balance_piastres: money,
  free_orders_remaining: count,
  subscription_active: z.boolean(),
  order_fee_fixed_piastres: money,
  order_fee_percent_bps: count,
});
export type StoreLaunchChecklist = z.infer<typeof checklistSchema>;

/** Null when the database predates the wallet model, so the page still renders. */
export async function getMyStoreLaunchChecklist(storeId: string): Promise<StoreLaunchChecklist | null> {
  try {
    return await rpc('get_my_store_launch_checklist', { p_store_id: storeId }, checklistSchema);
  } catch (error) {
    if (error instanceof WalletError && error.code === 'authentication_required') throw error;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Finance administration
// ---------------------------------------------------------------------------

const adminOverviewSchema = z.object({
  settings: z.object({
    order_fee_fixed_piastres: money,
    order_fee_percent_bps: count,
    order_fee_max_piastres: money.nullable(),
    free_orders_per_merchant: count,
    minimum_topup_piastres: money,
    payment_recipient_name: z.string().nullable(),
    payment_instapay_handle: z.string().nullable(),
    payment_phone: z.string().nullable(),
  }).passthrough(),
  plans: z.array(z.object({
    id: uuid, name: z.string(), duration_days: count, price_piastres: money,
    is_active: z.boolean(), sort_order: z.number().int(),
  })).max(100),
  topups: z.array(z.object({
    id: uuid,
    public_code: z.string(),
    merchant_id: uuid,
    merchant_name: z.string(),
    requester_name: z.string().nullable(),
    amount_piastres: money,
    payer_name: z.string(),
    payer_phone: z.string(),
    transfer_reference: z.string().nullable(),
    status: z.enum(['pending', 'approved', 'rejected']),
    review_notes: z.string().nullable(),
    created_at: timestamp,
    reviewed_at: timestamp.nullable(),
    payer_phone_other_merchants: count,
  })).max(100),
  wallets: z.array(z.object({
    merchant_id: uuid,
    merchant_name: z.string(),
    is_active: z.boolean(),
    balance_piastres: money,
    free_orders_used: count,
    subscription_ends_at: timestamp.nullable(),
    accepted_orders: count,
    fees_paid_piastres: money,
  })).max(500),
});
export type WalletAdminOverview = z.infer<typeof adminOverviewSchema>;

export async function getMarketplaceWalletAdminOverview(status: WalletTopupStatus | null): Promise<WalletAdminOverview> {
  return rpc('get_marketplace_wallet_admin_overview', { p_status: status }, adminOverviewSchema);
}

export async function reviewWalletTopupRequestAsAdmin(input: {
  requestId: string; approve: boolean; notes: string | null;
}): Promise<void> {
  await rpc('review_wallet_topup_request_as_admin', {
    p_request_id: input.requestId, p_approve: input.approve, p_notes: input.notes,
  }, z.object({ id: uuid }).passthrough());
}

export async function adjustMerchantWalletAsAdmin(input: {
  merchantId: string; amountPiastres: number; note: string; idempotencyKey: string;
}): Promise<void> {
  await rpc('adjust_merchant_wallet_as_admin', {
    p_merchant_id: input.merchantId, p_amount_piastres: input.amountPiastres,
    p_note: input.note, p_idempotency_key: input.idempotencyKey,
  }, z.object({ balance_piastres: money }).passthrough());
}

export async function saveMarketplaceFeeSettingsAsAdmin(input: {
  fixedPiastres: number;
  percentBps: number;
  maxPiastres: number | null;
  freeOrders: number;
  minimumTopupPiastres: number;
  recipientName: string | null;
  instapayHandle: string | null;
  phone: string | null;
}): Promise<void> {
  await rpc('save_marketplace_fee_settings_as_admin', {
    p_order_fee_fixed_piastres: input.fixedPiastres,
    p_order_fee_percent_bps: input.percentBps,
    p_order_fee_max_piastres: input.maxPiastres,
    p_free_orders_per_merchant: input.freeOrders,
    p_minimum_topup_piastres: input.minimumTopupPiastres,
    p_payment_recipient_name: input.recipientName,
    p_payment_instapay_handle: input.instapayHandle,
    p_payment_phone: input.phone,
  }, z.object({}).passthrough());
}

export async function saveMarketplaceSubscriptionPlanAsAdmin(input: {
  planId: string | null; name: string; durationDays: number; pricePiastres: number; isActive: boolean;
}): Promise<void> {
  await rpc('save_marketplace_subscription_plan_as_admin', {
    p_plan_id: input.planId, p_name_ar: input.name, p_duration_days: input.durationDays,
    p_price_piastres: input.pricePiastres, p_is_active: input.isActive,
  }, z.object({ id: uuid }));
}

/** A short-lived link to the transfer screenshot, for finance admins only. */
export async function createWalletTopupProofUrlAsAdmin(requestId: string): Promise<string | null> {
  if (!uuid.safeParse(requestId).success) return null;
  const path = await rpc('get_wallet_topup_proof_path_as_admin', { p_request_id: requestId }, z.string().max(300).nullable());
  if (!path) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(WALLET_PROOF_BUCKET).createSignedUrl(path, 120);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

const duplicateSignalSchema = z.array(z.object({
  kind: z.enum(['phone', 'store_name', 'free_orders_reused']),
  label: z.string().max(200),
  merchants: z.array(z.object({
    id: uuid,
    name: z.string(),
    is_active: z.boolean(),
    created_at: timestamp,
    free_orders_used: count,
  })).max(50),
})).max(500);
export type DuplicateMerchantSignal = z.infer<typeof duplicateSignalSchema>[number];

export async function listDuplicateMerchantSignalsAsAdmin(): Promise<DuplicateMerchantSignal[]> {
  return rpc('list_duplicate_merchant_signals_as_admin', undefined, duplicateSignalSchema);
}

// ---------------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------------

const countMap = z.record(z.string(), count);

const dashboardSchema = z.object({
  days: count,
  generated_at: timestamp,
  accounts: z.object({
    profiles: count, profiles_new: count, customers: count, customers_new: count,
    merchants: count, drivers: count, pending_account_requests: count,
    workspaces_by_status: countMap,
  }),
  catalog: z.object({
    stores_by_status: countMap, products_by_status: countMap,
    out_of_stock_variants: count, delivery_zones_active: count,
  }),
  orders: z.object({
    by_status: countMap,
    period_total: count, period_accepted: count, period_delivered: count,
    period_gmv_piastres: money, awaiting_store_over_2h: count,
    daily: z.array(z.object({ date: z.string().max(32), orders: count, gmv_piastres: money })).max(200),
  }),
  revenue: z.object({
    fees_period_piastres: money, fees_total_piastres: money, subscriptions_period_piastres: money,
    topups_period_piastres: money, wallet_balances_piastres: money,
    pending_topups: count, pending_topups_piastres: money,
    free_orders_used: count, active_subscriptions: count, stores_out_of_credit: count,
  }),
  funnel: z.object({
    visitors: count, marketplace_page_views: count, product_page_views: count,
    carts_started: count, carts_open_with_items: count, checkout_attempts: count,
    checkout_failures: countMap, orders_placed: count,
    top_routes: z.array(z.object({ route: z.string().max(300), views: count })).max(20),
    daily_visitors: z.array(z.object({ date: z.string().max(32), visitors: count })).max(200),
  }),
  stores: z.array(z.object({
    id: uuid, name: z.string(), status: z.string(), merchant_name: z.string(),
    active_products: count, period_orders: count, awaiting_orders: count,
    storage_bytes: count, balance_piastres: money, free_orders_remaining: count,
    has_contact: z.boolean().nullable(),
  })).max(50),
  storage: z.object({
    buckets: z.array(z.object({ bucket: z.string(), objects: count, bytes: count })).max(50),
    managed_media_bytes: count, managed_media_files: count,
  }),
  problems: z.object({
    client_errors: z.array(z.object({
      route: z.string(), error_kind: z.string(), event_type: z.string(), browser_family: z.string(),
      occurrences: count, last_seen_at: timestamp,
    })).max(20),
    client_errors_7d: count, stores_pending_review: count, products_pending_review: count,
    push_dead_letters: count, outbox_dead_letters: count, open_chat_reports: count,
    published_stores_without_contact: count, published_stores_without_delivery: count,
    release_ready: z.boolean().nullable(),
  }),
});
export type MarketplaceAdminDashboard = z.infer<typeof dashboardSchema>;

export async function getMarketplaceAdminDashboard(days: number): Promise<MarketplaceAdminDashboard> {
  return rpc('get_marketplace_admin_dashboard', { p_days: days }, dashboardSchema);
}
