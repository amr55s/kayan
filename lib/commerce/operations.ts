import 'server-only';

import { z } from 'zod';
import { databaseMinorToNumber } from '@/lib/commerce/money';
import { createClient } from '@/lib/supabase/server';

export const marketplaceOrderStatuses = [
  'pending_confirmation',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'delivery_failed',
  'delivered',
  'cancelled',
  'rejected',
  'issue',
  'return_requested',
  'return_approved',
  'returned',
] as const;

export type MarketplaceOrderStatus = (typeof marketplaceOrderStatuses)[number];

const uuid = z.uuid();
const timestamp = z.string().min(1).max(64);
const orderStatus = z.enum(marketplaceOrderStatuses);
const databaseMoney = z.union([
  z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^-?\d{1,14}$/u),
]);
const addressSchema = z.object({
  recipient_name: z.string().min(1).max(120).optional(),
  recipient_phone: z.string().min(1).max(32).optional(),
  address_line: z.string().min(1).max(300).optional(),
  building: z.string().max(80).nullable().optional(),
  floor: z.string().max(40).nullable().optional(),
  apartment: z.string().max(40).nullable().optional(),
  landmark: z.string().max(160).nullable().optional(),
  redacted: z.boolean().optional(),
});

const returnRequestSchema = z.object({
  id: uuid,
  public_code: z.string().min(8).max(64),
  reason_code: z.enum(['change_of_mind', 'defective', 'damaged', 'wrong_item', 'missing_parts', 'other']),
  reason_details: z.string().max(1_000).nullable(),
  status: z.enum(['requested', 'approved', 'rejected', 'received', 'cancelled']),
  review_notes: z.string().max(1_000).nullable(),
  refund_amount_piastres: databaseMoney,
  created_at: timestamp,
  reviewed_at: timestamp.nullable(),
  received_at: timestamp.nullable(),
  items: z.array(z.object({
    order_item_id: uuid,
    quantity: z.number().int().min(1).max(99),
    eligibility_deadline: timestamp,
    gross_amount_piastres: databaseMoney,
    refund_amount_piastres: databaseMoney,
    restock_quantity: z.number().int().min(0).max(99),
  })).min(1).max(100),
});

const orderSummarySchema = z.object({
  id: uuid,
  public_code: z.string().min(8).max(64),
  order_group_id: uuid,
  store_id: uuid,
  store_name: z.string().min(1).max(180),
  status: orderStatus,
  payment_status: z.string().min(1).max(40),
  delivery_mode: z.enum(['platform', 'self']),
  grand_total_piastres: databaseMoney,
  created_at: timestamp,
  updated_at: timestamp,
});

const orderDetailSchema = orderSummarySchema.extend({
  payment_method: z.literal('cod'),
  address: addressSchema,
  delivery_notes: z.string().max(1_000).nullable(),
  subtotal_piastres: databaseMoney,
  merchant_discount_total_piastres: databaseMoney,
  platform_discount_total_piastres: databaseMoney,
  discount_total_piastres: databaseMoney,
  delivery_fee_piastres: databaseMoney,
  confirmed_at: timestamp.nullable(),
  ready_at: timestamp.nullable(),
  delivered_at: timestamp.nullable(),
  cancelled_at: timestamp.nullable(),
  items: z.array(z.object({
    id: uuid,
    product_id: uuid,
    variant_id: uuid,
    product_name: z.string().min(1).max(200),
    variant_name: z.string().max(160).nullable(),
    sku: z.string().max(120).nullable(),
    image_url: z.url().nullable(),
    unit_price_piastres: databaseMoney,
    quantity: z.number().int().min(1).max(99),
    line_total_piastres: databaseMoney,
    returned_quantity: z.number().int().min(0).max(99),
    change_of_mind_deadline: timestamp.nullable(),
    defect_deadline: timestamp.nullable(),
    change_of_mind_allowed: z.boolean(),
    defect_return_allowed: z.boolean(),
    review: z.object({
      id: uuid,
      rating: z.number().int().min(1).max(5),
      title: z.string().max(120).nullable(),
      body: z.string().max(2_000).nullable(),
      status: z.string().min(1).max(40),
      updated_at: timestamp,
    }).nullable().optional(),
  })).min(1).max(100),
  events: z.array(z.object({
    id: uuid,
    type: z.string().min(1).max(120),
    from_status: orderStatus.nullable(),
    to_status: orderStatus.nullable(),
    created_at: timestamp,
  })).max(500),
  delivery: z.object({
    status: z.string().min(1).max(40),
    driver_name: z.string().max(120).nullable(),
    assigned_at: timestamp.nullable(),
    picked_up_at: timestamp.nullable(),
    delivered_at: timestamp.nullable(),
    proof_asset_id: uuid.nullable(),
    proof_available: z.boolean(),
  }).nullable(),
  return_eligibility: z.object({
    delivered_at: timestamp.nullable(),
    default_change_of_mind_deadline: timestamp.nullable(),
    default_defect_deadline: timestamp.nullable(),
  }),
  return_requests: z.array(returnRequestSchema).max(100),
});

export type MarketplaceOrderSummary = {
  id: string;
  publicCode: string;
  orderGroupId: string;
  storeId: string;
  storeName: string;
  status: MarketplaceOrderStatus;
  paymentStatus: string;
  deliveryMode: 'platform' | 'self';
  grandTotalMinor: number;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceOrderDetail = MarketplaceOrderSummary & {
  address: {
    recipientName: string | null;
    recipientPhone: string | null;
    addressLine: string | null;
    building: string | null;
    floor: string | null;
    apartment: string | null;
    landmark: string | null;
    redacted: boolean;
  };
  deliveryNotes: string | null;
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  items: Array<{
    id: string;
    productId: string;
    variantId: string;
    productName: string;
    variantName: string | null;
    sku: string | null;
    imageUrl: string | null;
    unitPriceMinor: number;
    quantity: number;
    returnedQuantity: number;
    changeOfMindDeadline: string | null;
    defectDeadline: string | null;
    changeOfMindAllowed: boolean;
    defectReturnAllowed: boolean;
    lineTotalMinor: number;
    review: { id: string; rating: number; title: string | null; body: string | null; status: string } | null;
  }>;
  events: Array<{
    id: string;
    type: string;
    fromStatus: MarketplaceOrderStatus | null;
    toStatus: MarketplaceOrderStatus | null;
    createdAt: string;
  }>;
  delivery: {
    status: string;
    driverName: string | null;
    proofAssetId: string | null;
    proofAvailable: boolean;
  } | null;
  returnEligibility: {
    deliveredAt: string | null;
    defaultChangeOfMindDeadline: string | null;
    defaultDefectDeadline: string | null;
  };
  returnRequests: Array<{
    id: string;
    publicCode: string;
    reasonCode: z.infer<typeof returnRequestSchema>['reason_code'];
    reasonDetails: string | null;
    status: z.infer<typeof returnRequestSchema>['status'];
    reviewNotes: string | null;
    refundAmountMinor: number;
    createdAt: string;
    reviewedAt: string | null;
    receivedAt: string | null;
    items: Array<{
      orderItemId: string;
      quantity: number;
      eligibilityDeadline: string;
      grossAmountMinor: number;
      refundAmountMinor: number;
      restockQuantity: number;
    }>;
  }>;
};

export class MarketplaceOperationsError extends Error {
  constructor(public readonly code: 'authentication_required' | 'not_found' | 'invalid_contract' | 'service_unavailable') {
    super(code);
  }
}

function mapSummary(value: z.infer<typeof orderSummarySchema>): MarketplaceOrderSummary {
  return {
    id: value.id,
    publicCode: value.public_code,
    orderGroupId: value.order_group_id,
    storeId: value.store_id,
    storeName: value.store_name,
    status: value.status,
    paymentStatus: value.payment_status,
    deliveryMode: value.delivery_mode,
    grandTotalMinor: databaseMinorToNumber(value.grand_total_piastres),
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new MarketplaceOperationsError('authentication_required');
  return supabase;
}

export async function listMyMarketplaceOrders(input: {
  limit?: number;
  before?: string | null;
} = {}): Promise<MarketplaceOrderSummary[]> {
  const limit = Math.min(100, Math.max(1, input.limit ?? 30));
  const before = input.before && timestamp.safeParse(input.before).success ? input.before : null;
  const supabase = await authenticatedClient();
  const { data, error } = await (supabase as any).rpc('list_my_marketplace_orders', {
    p_limit: limit,
    p_before: before,
  });
  if (error) throw new MarketplaceOperationsError('service_unavailable');
  const parsed = z.array(orderSummarySchema).max(100).safeParse(data);
  if (!parsed.success) throw new MarketplaceOperationsError('invalid_contract');
  return parsed.data.map(mapSummary);
}

export async function getMyMarketplaceOrder(orderId: string): Promise<MarketplaceOrderDetail | null> {
  if (!uuid.safeParse(orderId).success) return null;
  const supabase = await authenticatedClient();
  const { data, error } = await (supabase as any).rpc('get_my_marketplace_order', {
    p_order_id: orderId,
  });
  if (error) {
    if (/order_not_found/u.test(error.message ?? '')) return null;
    throw new MarketplaceOperationsError('service_unavailable');
  }
  const parsed = orderDetailSchema.safeParse(data);
  if (!parsed.success) throw new MarketplaceOperationsError('invalid_contract');
  const value = parsed.data;
  return {
    ...mapSummary(value),
    address: {
      recipientName: value.address.recipient_name ?? null,
      recipientPhone: value.address.recipient_phone ?? null,
      addressLine: value.address.address_line ?? null,
      building: value.address.building ?? null,
      floor: value.address.floor ?? null,
      apartment: value.address.apartment ?? null,
      landmark: value.address.landmark ?? null,
      redacted: value.address.redacted === true,
    },
    deliveryNotes: value.delivery_notes,
    subtotalMinor: databaseMinorToNumber(value.subtotal_piastres),
    discountMinor: databaseMinorToNumber(value.discount_total_piastres),
    deliveryFeeMinor: databaseMinorToNumber(value.delivery_fee_piastres),
    items: value.items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      variantId: item.variant_id,
      productName: item.product_name,
      variantName: item.variant_name,
      sku: item.sku,
      imageUrl: item.image_url,
      unitPriceMinor: databaseMinorToNumber(item.unit_price_piastres),
      quantity: item.quantity,
      returnedQuantity: item.returned_quantity,
      changeOfMindDeadline: item.change_of_mind_deadline,
      defectDeadline: item.defect_deadline,
      changeOfMindAllowed: item.change_of_mind_allowed,
      defectReturnAllowed: item.defect_return_allowed,
      lineTotalMinor: databaseMinorToNumber(item.line_total_piastres),
      review: item.review ? {
        id: item.review.id,
        rating: item.review.rating,
        title: item.review.title,
        body: item.review.body,
        status: item.review.status,
      } : null,
    })),
    events: value.events.map((event) => ({
      id: event.id,
      type: event.type,
      fromStatus: event.from_status,
      toStatus: event.to_status,
      createdAt: event.created_at,
    })),
    delivery: value.delivery ? {
      status: value.delivery.status,
      driverName: value.delivery.driver_name,
      proofAssetId: value.delivery.proof_asset_id,
      proofAvailable: value.delivery.proof_available,
    } : null,
    returnEligibility: {
      deliveredAt: value.return_eligibility.delivered_at,
      defaultChangeOfMindDeadline: value.return_eligibility.default_change_of_mind_deadline,
      defaultDefectDeadline: value.return_eligibility.default_defect_deadline,
    },
    returnRequests: value.return_requests.map((request) => ({
      id: request.id,
      publicCode: request.public_code,
      reasonCode: request.reason_code,
      reasonDetails: request.reason_details,
      status: request.status,
      reviewNotes: request.review_notes,
      refundAmountMinor: databaseMinorToNumber(request.refund_amount_piastres),
      createdAt: request.created_at,
      reviewedAt: request.reviewed_at,
      receivedAt: request.received_at,
      items: request.items.map((item) => ({
        orderItemId: item.order_item_id,
        quantity: item.quantity,
        eligibilityDeadline: item.eligibility_deadline,
        grossAmountMinor: databaseMinorToNumber(item.gross_amount_piastres),
        refundAmountMinor: databaseMinorToNumber(item.refund_amount_piastres),
        restockQuantity: item.restock_quantity,
      })),
    })),
  };
}

const cursorPage = <T extends z.ZodTypeAny>(item: T) => z.object({
  items: z.array(item).max(100),
  next_before: timestamp.nullable(),
});

const moderationPageSchema = cursorPage(z.object({
  entity_type: z.enum(['product', 'store']), id: uuid, store_id: uuid,
  name: z.string().min(1).max(200), status: z.string().max(40),
  submitted_at: timestamp, primary_image_url: z.url().nullable(),
}));
const categoryProposalSchema = z.object({
  id: uuid,
  store_id: uuid,
  store_name: z.string().min(1).max(180),
  product_id: uuid,
  product_name: z.string().min(2).max(200),
  proposed_name: z.string().min(2).max(120),
  created_at: timestamp,
});
const activeCategorySchema = z.object({
  id: uuid,
  name_ar: z.string().min(2).max(120),
});
const deliveryOfferPageSchema = cursorPage(z.object({
  id: uuid, order_id: uuid, order_code: z.string().max(64), store_name: z.string().max(180),
  delivery_zone_name: z.string().max(180), delivery_fee_piastres: databaseMoney,
  package_count: z.number().int().nonnegative(), ready_at: timestamp.nullable(), expires_at: timestamp,
}));
const codPageSchema = cursorPage(z.object({
  collection_id: uuid, order_id: uuid, order_code: z.string().max(64),
  amount_piastres: databaseMoney, status: z.string().max(40), collected_at: timestamp.nullable(),
}));
const reconciliationPageSchema = cursorPage(z.object({
  id: uuid, status: z.string().max(40), expected_total_piastres: databaseMoney,
  submitted_total_piastres: databaseMoney, submitted_at: timestamp.nullable(),
  reviewed_at: timestamp.nullable(), created_at: timestamp,
}));
const reconciliationDetailSchema = z.object({
  id: uuid, status: z.string().max(40), expected_total_piastres: databaseMoney,
  submitted_total_piastres: databaseMoney, submitted_at: timestamp.nullable(), accepted_at: timestamp.nullable(),
  reviewed_at: timestamp.nullable(), notes: z.string().max(1_000).nullable(),
  items: z.array(z.object({
    collection_id: uuid, order_id: uuid, order_code: z.string().max(64),
    expected_amount_piastres: databaseMoney, submitted_amount_piastres: databaseMoney,
    collection_status: z.string().max(40), collected_at: timestamp.nullable(),
  })).max(100),
});
const commissionPageSchema = z.object({
  items: z.array(z.object({
    id: uuid, store_id: uuid, period_start: z.string().max(32), period_end: z.string().max(32),
    status: z.string().max(40), gross_piastres: databaseMoney,
    commission_piastres: databaseMoney, generated_at: timestamp,
  })).max(100), total: z.coerce.number().int().nonnegative(),
});
const commissionDetailSchema = z.object({
  id: uuid, store_id: uuid, period_start: z.string().max(32), period_end: z.string().max(32),
  status: z.string().max(40), gross_piastres: databaseMoney, commission_rate: z.union([z.number(), z.string()]),
  commission_piastres: databaseMoney, manual_adjustment_piastres: databaseMoney,
  total_due_piastres: databaseMoney, issued_at: timestamp.nullable(), paid_at: timestamp.nullable(),
  notes: z.string().max(2_000).nullable(), entries: z.array(z.object({
    id: uuid, order_id: uuid.nullable(), entry_type: z.string().max(40), gross_piastres: databaseMoney,
    commission_piastres: databaseMoney, recognized_at: timestamp,
  })).max(5_000),
});
const adminCommissionPageSchema = cursorPage(z.object({
  id: uuid, store_id: uuid, store_name: z.string().max(180),
  period_start: z.string().max(32), period_end: z.string().max(32), status: z.enum(['draft', 'issued', 'paid', 'disputed', 'void']),
  gross_piastres: databaseMoney, commission_piastres: databaseMoney,
  manual_adjustment_piastres: databaseMoney, total_due_piastres: databaseMoney,
  issued_at: timestamp.nullable(), paid_at: timestamp.nullable(), notes: z.string().max(2_000).nullable(),
  created_at: timestamp, updated_at: timestamp,
}));
const supportPageSchema = cursorPage(z.object({
  id: uuid, public_code: z.string().max(64), subject: z.string().max(160),
  status: z.string().max(40), order_id: uuid.nullable(), last_message_at: timestamp,
  unread_count: z.number().int().nonnegative(),
}));
const supportThreadSchema = z.object({
  id: uuid, public_code: z.string().max(64), subject: z.string().max(160), status: z.string().max(40),
  order_id: uuid.nullable(), store_id: uuid.nullable(), last_message_at: timestamp,
  messages: z.array(z.object({
    id: uuid, author_role: z.enum(['customer', 'merchant', 'admin', 'system']),
    body: z.string().max(5_000), created_at: timestamp,
  })).max(100),
  next_cursor: z.object({ created_at: timestamp, id: uuid }).nullable(),
  has_more: z.boolean(),
});

export type MarketplaceModerationItem = z.infer<typeof moderationPageSchema>['items'][number];
export type ProductCategoryProposal = z.infer<typeof categoryProposalSchema>;
export type ActiveProductCategory = z.infer<typeof activeCategorySchema>;
export type MarketplaceDeliveryOffer = z.infer<typeof deliveryOfferPageSchema>['items'][number];
export type MarketplaceCodCollection = z.infer<typeof codPageSchema>['items'][number];
export type MarketplaceReconciliation = z.infer<typeof reconciliationPageSchema>['items'][number];
export type MarketplaceReconciliationDetail = z.infer<typeof reconciliationDetailSchema>;
export type MarketplaceCommissionStatement = z.infer<typeof commissionPageSchema>['items'][number];
export type MarketplaceCommissionStatementDetail = z.infer<typeof commissionDetailSchema>;
export type AdminMarketplaceCommissionStatement = z.infer<typeof adminCommissionPageSchema>['items'][number];
export type MarketplaceSupportThreadSummary = z.infer<typeof supportPageSchema>['items'][number];
export type MarketplaceSupportThread = z.infer<typeof supportThreadSchema>;
export type MarketplaceSupportMessageCursor = { createdAt: string; id: string };
export type CursorPage<T> = { items: T[]; nextBefore: string | null };

async function authenticatedRpc(name: string, args: Record<string, unknown>) {
  const supabase = await authenticatedClient();
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new MarketplaceOperationsError('service_unavailable');
  return data;
}

function parseCursorPage<T>(schema: z.ZodType<{ items: T[]; next_before: string | null }>, data: unknown): CursorPage<T> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new MarketplaceOperationsError('invalid_contract');
  return { items: parsed.data.items, nextBefore: parsed.data.next_before };
}

export async function listPendingMarketplaceModeration(input: { entity?: 'all' | 'product' | 'store'; limit?: number; before?: string | null } = {}) {
  return parseCursorPage(moderationPageSchema, await authenticatedRpc('list_pending_marketplace_moderation', {
    p_entity: input.entity ?? 'all', p_limit: Math.min(100, Math.max(1, input.limit ?? 30)), p_before: input.before ?? null,
  }));
}

export async function listPendingProductCategoryProposals(limit = 50): Promise<ProductCategoryProposal[]> {
  const parsed = z.array(categoryProposalSchema).max(100).safeParse(
    await authenticatedRpc('list_pending_product_category_proposals', {
      p_limit: Math.min(100, Math.max(1, limit)),
    }),
  );
  if (!parsed.success) throw new MarketplaceOperationsError('invalid_contract');
  return parsed.data;
}

export async function listActiveProductCategories(): Promise<ActiveProductCategory[]> {
  const supabase = await authenticatedClient();
  const { data, error } = await (supabase as any)
    .from('product_categories')
    .select('id,name_ar')
    .eq('is_active', true)
    .order('sort_order')
    .limit(500);
  if (error) throw new MarketplaceOperationsError('service_unavailable');
  const parsed = z.array(activeCategorySchema).max(500).safeParse(data ?? []);
  if (!parsed.success) throw new MarketplaceOperationsError('invalid_contract');
  return parsed.data;
}

export async function listMyMarketplaceDeliveryOffers(input: { limit?: number; before?: string | null } = {}) {
  return parseCursorPage(deliveryOfferPageSchema, await authenticatedRpc('list_my_marketplace_delivery_offers', {
    p_limit: Math.min(100, Math.max(1, input.limit ?? 30)), p_before: input.before ?? null,
  }));
}

export async function listMyCodCollections(input: { status?: string | null; limit?: number; before?: string | null } = {}) {
  return parseCursorPage(codPageSchema, await authenticatedRpc('list_my_cod_collections', {
    p_status: input.status ?? null, p_limit: Math.min(100, Math.max(1, input.limit ?? 30)), p_before: input.before ?? null,
  }));
}

export async function listMyCashReconciliations(input: { status?: string | null; limit?: number; before?: string | null } = {}) {
  return parseCursorPage(reconciliationPageSchema, await authenticatedRpc('list_my_cash_reconciliations', {
    p_status: input.status ?? null, p_limit: Math.min(100, Math.max(1, input.limit ?? 30)), p_before: input.before ?? null,
  }));
}

export async function getMyCashReconciliation(batchId: string): Promise<MarketplaceReconciliationDetail | null> {
  if (!uuid.safeParse(batchId).success) return null;
  const parsed = reconciliationDetailSchema.safeParse(await authenticatedRpc('get_my_cash_reconciliation', { p_batch_id: batchId }));
  if (!parsed.success) throw new MarketplaceOperationsError('invalid_contract');
  return parsed.data;
}

export async function listMyCommissionStatements(storeId: string, input: { limit?: number; offset?: number } = {}) {
  if (!uuid.safeParse(storeId).success) throw new MarketplaceOperationsError('invalid_contract');
  const parsed = commissionPageSchema.safeParse(await authenticatedRpc('list_my_commission_statements', {
    p_store_id: storeId, p_limit: Math.min(100, Math.max(1, input.limit ?? 24)), p_offset: Math.max(0, input.offset ?? 0),
  }));
  if (!parsed.success) throw new MarketplaceOperationsError('invalid_contract');
  return parsed.data;
}

export async function getMyCommissionStatement(statementId: string): Promise<MarketplaceCommissionStatementDetail | null> {
  if (!uuid.safeParse(statementId).success) return null;
  const supabase = await authenticatedClient();
  const { data, error } = await (supabase as any).rpc('get_my_commission_statement', {
    p_statement_id: statementId,
  });
  if (error) {
    if (error.code === 'P0002' || /statement_not_found/u.test(error.message ?? '')) return null;
    throw new MarketplaceOperationsError('service_unavailable');
  }
  const parsed = commissionDetailSchema.safeParse(data);
  if (!parsed.success) throw new MarketplaceOperationsError('invalid_contract');
  return parsed.data;
}

export async function listAllCommissionStatementsAsAdmin(input: { status?: string | null; limit?: number; before?: string | null } = {}) {
  return parseCursorPage(adminCommissionPageSchema, await authenticatedRpc('list_all_commission_statements_as_admin', {
    p_status: input.status ?? null, p_limit: Math.min(100, Math.max(1, input.limit ?? 50)), p_before: input.before ?? null,
  }));
}

export async function listMyMarketplaceSupportThreads(input: { status?: string | null; limit?: number; before?: string | null } = {}) {
  return parseCursorPage(supportPageSchema, await authenticatedRpc('list_my_marketplace_support_threads', {
    p_status: input.status ?? null, p_limit: Math.min(100, Math.max(1, input.limit ?? 30)), p_before: input.before ?? null,
  }));
}

export async function getMyMarketplaceSupportThread(
  threadId: string,
  input: { limit?: number; cursor?: MarketplaceSupportMessageCursor | null } = {},
): Promise<MarketplaceSupportThread | null> {
  if (!uuid.safeParse(threadId).success) return null;
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));
  const cursor = input.cursor
    && timestamp.safeParse(input.cursor.createdAt).success
    && uuid.safeParse(input.cursor.id).success
    ? input.cursor
    : null;
  try {
    const parsed = supportThreadSchema.safeParse(await authenticatedRpc('get_my_marketplace_support_thread_page', {
      p_thread_id: threadId,
      p_limit: limit,
      p_before_created_at: cursor?.createdAt ?? null,
      p_before_id: cursor?.id ?? null,
    }));
    if (!parsed.success) throw new MarketplaceOperationsError('invalid_contract');
    return parsed.data;
  } catch (error) {
    if (error instanceof MarketplaceOperationsError && error.code === 'service_unavailable') return null;
    throw error;
  }
}
