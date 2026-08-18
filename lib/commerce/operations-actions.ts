'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import { marketplaceOrderStatuses } from './operations';

const uuid = z.uuid();
const transitionSchema = z.object({
  orderId: uuid,
  next: z.enum(marketplaceOrderStatuses),
  reason: z.string().trim().max(1_000).optional(),
  collectedAmountMinor: z.string().regex(/^\d{1,14}$/u).optional(),
  returnTo: z.string().regex(/^\/(?:account|merchant\/marketplace|admin\/marketplace|driver\/marketplace)(?:\/[^?]*)?$/u),
});
const reviewSchema = z.object({
  orderItemId: uuid,
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().max(2_000).optional(),
  returnTo: z.string().regex(/^\/account\/orders\/[0-9a-f-]+$/iu),
});
const returnToSchema = z.string().regex(/^\/(?:account|merchant\/marketplace|admin\/marketplace|driver\/marketplace)(?:\/[^?]*)?$/u);
const moderationSchema = z.object({
  entityType: z.enum(['product', 'store']), entityId: uuid, approve: z.enum(['true', 'false']),
  notes: z.string().trim().max(1_000).optional(), returnTo: returnToSchema,
});
const offerResponseSchema = z.object({ offerId: uuid, accept: z.enum(['true', 'false']), returnTo: returnToSchema });
const supportCreateSchema = z.object({
  orderId: uuid.optional(), storeId: uuid.optional(), subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(1).max(5_000), returnTo: returnToSchema,
}).refine((value) => value.orderId || value.storeId, 'support_scope_required');
const supportReplySchema = z.object({
  threadId: uuid, body: z.string().trim().min(1).max(5_000), returnTo: returnToSchema,
});
const supportCloseSchema = z.object({ threadId: uuid, returnTo: returnToSchema });
const reconciliationCreateSchema = z.object({
  collectionIds: z.array(uuid).min(1).max(100), submittedAmounts: z.array(z.string().regex(/^\d{1,14}$/u)).min(1).max(100),
  idempotencyKey: z.string().trim().min(8).max(128), returnTo: returnToSchema,
}).refine((value) => value.collectionIds.length === value.submittedAmounts.length, 'reconciliation_length_mismatch');
const reconciliationDecisionSchema = z.object({
  batchId: uuid, accept: z.enum(['true', 'false']), notes: z.string().trim().max(1_000).optional(), returnTo: returnToSchema,
});
const commissionTransitionSchema = z.object({
  statementId: uuid, next: z.enum(['issued', 'paid', 'disputed', 'void']),
  idempotencyKey: z.string().trim().min(16).max(128), notes: z.string().trim().max(2_000).optional(),
  manualAdjustmentMinor: z.string().regex(/^-?\d{1,14}$/u).optional(), returnTo: returnToSchema,
}).superRefine((value, context) => {
  if (['disputed', 'void'].includes(value.next) && (!value.notes || value.notes.length < 3)) {
    context.addIssue({ code: 'custom', path: ['notes'], message: 'notes_required' });
  }
  if (value.manualAdjustmentMinor && !['issued', 'void'].includes(value.next)) {
    context.addIssue({ code: 'custom', path: ['manualAdjustmentMinor'], message: 'adjustment_locked' });
  }
});
const partialReturnCreateSchema = z.object({
  orderId: uuid,
  reasonCode: z.enum(['change_of_mind', 'defective', 'damaged', 'wrong_item', 'missing_parts', 'other']),
  reasonDetails: z.string().trim().max(1_000).optional(),
  itemIds: z.array(uuid).min(1).max(100),
  quantities: z.array(z.coerce.number().int().min(0).max(99)).min(1).max(100),
  idempotencyKey: z.string().min(16).max(128),
  returnTo: returnToSchema,
}).superRefine((value, context) => {
  if (value.itemIds.length !== value.quantities.length || !value.quantities.some((quantity) => quantity > 0)) {
    context.addIssue({ code: 'custom', path: ['quantities'], message: 'return_quantities_required' });
  }
  if (value.reasonCode === 'other' && (!value.reasonDetails || value.reasonDetails.length < 3)) {
    context.addIssue({ code: 'custom', path: ['reasonDetails'], message: 'return_details_required' });
  }
});
const partialReturnDecisionSchema = z.object({
  returnRequestId: uuid,
  approve: z.enum(['true', 'false']),
  notes: z.string().trim().max(1_000).optional(),
  idempotencyKey: z.string().min(16).max(128),
  returnTo: returnToSchema,
}).superRefine((value, context) => {
  if (value.approve === 'false' && (!value.notes || value.notes.length < 3)) {
    context.addIssue({ code: 'custom', path: ['notes'], message: 'return_rejection_notes_required' });
  }
});
const partialReturnReceiptSchema = z.object({
  returnRequestId: uuid,
  itemIds: z.array(uuid).min(1).max(100),
  restockQuantities: z.array(z.coerce.number().int().min(0).max(99)).min(1).max(100),
  notes: z.string().trim().max(1_000).optional(),
  idempotencyKey: z.string().min(16).max(128),
  returnTo: returnToSchema,
}).refine((value) => value.itemIds.length === value.restockQuantities.length, {
  path: ['restockQuantities'], message: 'restock_item_set_mismatch',
});

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function resultUrl(path: string, key: 'notice' | 'error', value: string): string {
  const url = new URL(path, 'https://dairtakk.local');
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

async function requireSupabase() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect('/signin?next=%2Faccount%2Forders');
  return supabase;
}

export async function transitionMarketplaceOrderAction(formData: FormData): Promise<void> {
  const parsed = transitionSchema.safeParse({
    orderId: field(formData, 'orderId'),
    next: field(formData, 'next'),
    reason: field(formData, 'reason'),
    collectedAmountMinor: field(formData, 'collectedAmountMinor'),
    returnTo: field(formData, 'returnTo'),
  });
  if (!parsed.success) redirect('/marketplace?error=invalid_order_action');
  const needsReason = ['cancelled', 'rejected', 'delivery_failed', 'issue', 'return_requested'].includes(parsed.data.next);
  if (needsReason && !parsed.data.reason) {
    redirect(resultUrl(parsed.data.returnTo, 'error', 'reason_required'));
  }
  const supabase = await requireSupabase();
  const { error } = await (supabase as any).rpc('set_my_marketplace_order_status', {
    p_order_id: parsed.data.orderId,
    p_next: parsed.data.next,
    p_reason: parsed.data.reason ?? null,
    p_collected_amount: parsed.data.collectedAmountMinor ?? null,
  });
  if (error) {
    const message = error.message ?? '';
    const code = /return_window_expired/u.test(message)
      ? 'return_window_expired'
      : /delivery_proof_required/u.test(message)
        ? 'delivery_proof_required'
        : /cod_amount_mismatch/u.test(message)
          ? 'cod_amount_mismatch'
          : /invalid_or_unauthorized|order_access_required/u.test(message)
            ? 'transition_not_allowed'
            : 'service_unavailable';
    redirect(resultUrl(parsed.data.returnTo, 'error', code));
  }
  revalidatePath('/account/orders');
  revalidatePath('/merchant/marketplace/orders');
  revalidatePath('/admin/marketplace/orders');
  revalidatePath('/driver/marketplace');
  redirect(resultUrl(parsed.data.returnTo, 'notice', 'status_updated'));
}

export async function createPartialMarketplaceReturnAction(formData: FormData): Promise<void> {
  const parsed = partialReturnCreateSchema.safeParse({
    orderId: field(formData, 'orderId'), reasonCode: field(formData, 'reasonCode'),
    reasonDetails: field(formData, 'reasonDetails'),
    itemIds: formData.getAll('returnItemId'), quantities: formData.getAll('returnQuantity'),
    idempotencyKey: field(formData, 'idempotencyKey'), returnTo: field(formData, 'returnTo'),
  });
  if (!parsed.success) redirect('/account/orders?error=invalid_return_request');
  const items = parsed.data.itemIds.flatMap((orderItemId, index) => {
    const quantity = parsed.data.quantities[index] ?? 0;
    return quantity > 0 ? [{ order_item_id: orderItemId, quantity }] : [];
  });
  const supabase = await requireSupabase();
  const { error } = await (supabase as any).rpc('create_my_marketplace_return_request', {
    p_order_id: parsed.data.orderId, p_reason_code: parsed.data.reasonCode,
    p_reason_details: parsed.data.reasonDetails ?? null, p_items: items,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    const code = /return_window_expired/u.test(error.message ?? '') ? 'return_window_expired'
      : /return_quantity_exceeded/u.test(error.message ?? '') ? 'return_quantity_exceeded'
        : /return_category_excluded/u.test(error.message ?? '') ? 'return_category_excluded'
          : 'return_request_failed';
    redirect(resultUrl(parsed.data.returnTo, 'error', code));
  }
  revalidatePath(parsed.data.returnTo);
  revalidatePath('/merchant/marketplace/orders');
  revalidatePath('/admin/marketplace/orders');
  redirect(resultUrl(parsed.data.returnTo, 'notice', 'return_requested'));
}

export async function reviewPartialMarketplaceReturnAction(formData: FormData): Promise<void> {
  const parsed = partialReturnDecisionSchema.safeParse({
    returnRequestId: field(formData, 'returnRequestId'), approve: field(formData, 'approve'),
    notes: field(formData, 'notes'), idempotencyKey: field(formData, 'idempotencyKey'),
    returnTo: field(formData, 'returnTo'),
  });
  if (!parsed.success) redirect('/merchant/marketplace/orders?error=invalid_return_review');
  if (parsed.data.returnTo.startsWith('/admin/')) {
    await requireMarketplaceAdminRole(['operations'], { nextPath: parsed.data.returnTo });
  }
  const supabase = await requireSupabase();
  const { error } = await (supabase as any).rpc('review_my_marketplace_return_request', {
    p_return_request_id: parsed.data.returnRequestId,
    p_approve: parsed.data.approve === 'true', p_notes: parsed.data.notes ?? null,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) redirect(resultUrl(parsed.data.returnTo, 'error', 'return_review_failed'));
  revalidatePath(parsed.data.returnTo);
  revalidatePath('/account/orders');
  redirect(resultUrl(parsed.data.returnTo, 'notice', parsed.data.approve === 'true' ? 'return_approved' : 'return_rejected'));
}

export async function receivePartialMarketplaceReturnAction(formData: FormData): Promise<void> {
  const parsed = partialReturnReceiptSchema.safeParse({
    returnRequestId: field(formData, 'returnRequestId'),
    itemIds: formData.getAll('restockItemId'), restockQuantities: formData.getAll('restockQuantity'),
    notes: field(formData, 'notes'), idempotencyKey: field(formData, 'idempotencyKey'),
    returnTo: field(formData, 'returnTo'),
  });
  if (!parsed.success) redirect('/merchant/marketplace/orders?error=invalid_return_receipt');
  if (parsed.data.returnTo.startsWith('/admin/')) {
    await requireMarketplaceAdminRole(['operations'], { nextPath: parsed.data.returnTo });
  }
  const restock = parsed.data.itemIds.map((orderItemId, index) => ({
    order_item_id: orderItemId, quantity: parsed.data.restockQuantities[index],
  }));
  const supabase = await requireSupabase();
  const { error } = await (supabase as any).rpc('receive_my_marketplace_return_request', {
    p_return_request_id: parsed.data.returnRequestId, p_restock_items: restock,
    p_notes: parsed.data.notes ?? null, p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) redirect(resultUrl(parsed.data.returnTo, 'error', 'return_receive_failed'));
  revalidatePath(parsed.data.returnTo);
  revalidatePath('/account/orders');
  revalidatePath('/admin/marketplace/orders');
  redirect(resultUrl(parsed.data.returnTo, 'notice', 'return_received'));
}

export async function submitMarketplaceReviewAction(formData: FormData): Promise<void> {
  const parsed = reviewSchema.safeParse({
    orderItemId: field(formData, 'orderItemId'),
    rating: field(formData, 'rating'),
    title: field(formData, 'title'),
    body: field(formData, 'body'),
    returnTo: field(formData, 'returnTo'),
  });
  if (!parsed.success) redirect('/account/orders?error=invalid_review');
  const supabase = await requireSupabase();
  const { error } = await (supabase as any).rpc('submit_product_review', {
    p_order_item_id: parsed.data.orderItemId,
    p_rating: parsed.data.rating,
    p_title: parsed.data.title ?? null,
    p_body: parsed.data.body ?? null,
  });
  if (error) {
    const code = /verified_purchase_required/u.test(error.message ?? '')
      ? 'verified_purchase_required'
      : /review_owner_mismatch|duplicate|unique/u.test(error.message ?? '')
        ? 'review_already_exists'
      : 'service_unavailable';
    redirect(resultUrl(parsed.data.returnTo, 'error', code));
  }
  revalidatePath(parsed.data.returnTo);
  redirect(resultUrl(parsed.data.returnTo, 'notice', 'review_saved'));
}

export async function moderateMarketplaceEntityAction(formData: FormData): Promise<void> {
  const parsed = moderationSchema.safeParse({
    entityType: field(formData, 'entityType'), entityId: field(formData, 'entityId'),
    approve: field(formData, 'approve'), notes: field(formData, 'notes'), returnTo: field(formData, 'returnTo'),
  });
  if (!parsed.success) redirect('/admin/marketplace/orders?error=invalid_moderation');
  await requireMarketplaceAdminRole(['catalog_reviewer'], { nextPath: parsed.data.returnTo });
  const supabase = await requireSupabase();
  const rpc = parsed.data.entityType === 'product' ? 'moderate_product_as_admin' : 'moderate_store_as_admin';
  const key = parsed.data.entityType === 'product' ? 'p_product_id' : 'p_store_id';
  const { error } = await (supabase as any).rpc(rpc, {
    [key]: parsed.data.entityId, p_approve: parsed.data.approve === 'true', p_notes: parsed.data.notes ?? null,
  });
  if (error) redirect(resultUrl(parsed.data.returnTo, 'error', 'moderation_failed'));
  revalidatePath('/admin/marketplace/orders');
  redirect(resultUrl(parsed.data.returnTo, 'notice', 'moderation_saved'));
}

export async function respondToMarketplaceDeliveryOfferAction(formData: FormData): Promise<void> {
  const parsed = offerResponseSchema.safeParse({ offerId: field(formData, 'offerId'), accept: field(formData, 'accept'), returnTo: field(formData, 'returnTo') });
  if (!parsed.success) redirect('/driver/marketplace?error=invalid_offer');
  const supabase = await requireSupabase();
  const { error } = await (supabase as any).rpc('respond_to_my_marketplace_delivery_offer', {
    p_offer_id: parsed.data.offerId, p_accept: parsed.data.accept === 'true',
  });
  if (error) redirect(resultUrl(parsed.data.returnTo, 'error', /expired|no_longer/u.test(error.message ?? '') ? 'offer_expired' : 'offer_failed'));
  revalidatePath('/driver/marketplace');
  redirect(resultUrl(parsed.data.returnTo, 'notice', parsed.data.accept === 'true' ? 'offer_accepted' : 'offer_declined'));
}

export async function createMarketplaceSupportThreadAction(formData: FormData): Promise<void> {
  const parsed = supportCreateSchema.safeParse({
    orderId: field(formData, 'orderId'), storeId: field(formData, 'storeId'), subject: field(formData, 'subject'),
    message: field(formData, 'message'), returnTo: field(formData, 'returnTo'),
  });
  if (!parsed.success) redirect('/account/orders?error=invalid_support_message');
  const supabase = await requireSupabase();
  const { error } = await (supabase as any).rpc('create_my_marketplace_support_thread', {
    p_order_id: parsed.data.orderId ?? null, p_store_id: parsed.data.storeId ?? null,
    p_subject: parsed.data.subject, p_message: parsed.data.message,
  });
  if (error) redirect(resultUrl(parsed.data.returnTo, 'error', 'support_failed'));
  revalidatePath(parsed.data.returnTo);
  redirect(resultUrl(parsed.data.returnTo, 'notice', 'support_created'));
}

export async function replyMarketplaceSupportThreadAction(formData: FormData): Promise<void> {
  const parsed = supportReplySchema.safeParse({ threadId: field(formData, 'threadId'), body: field(formData, 'body'), returnTo: field(formData, 'returnTo') });
  if (!parsed.success) redirect('/account/orders?error=invalid_support_message');
  const supabase = await requireSupabase();
  const { error } = await (supabase as any).rpc('reply_my_marketplace_support_thread', { p_thread_id: parsed.data.threadId, p_body: parsed.data.body });
  if (error) redirect(resultUrl(parsed.data.returnTo, 'error', 'support_failed'));
  revalidatePath(parsed.data.returnTo);
  redirect(resultUrl(parsed.data.returnTo, 'notice', 'support_replied'));
}

export async function closeMarketplaceSupportThreadAction(formData: FormData): Promise<void> {
  const parsed = supportCloseSchema.safeParse({ threadId: field(formData, 'threadId'), returnTo: field(formData, 'returnTo') });
  if (!parsed.success) redirect('/account/orders?error=invalid_support_message');
  const supabase = await requireSupabase();
  const { error } = await (supabase as any).rpc('close_my_marketplace_support_thread', { p_thread_id: parsed.data.threadId });
  if (error) redirect(resultUrl(parsed.data.returnTo, 'error', 'support_failed'));
  revalidatePath(parsed.data.returnTo);
  redirect(resultUrl(parsed.data.returnTo, 'notice', 'support_closed'));
}

export async function createCashReconciliationAction(formData: FormData): Promise<void> {
  const parsed = reconciliationCreateSchema.safeParse({
    collectionIds: formData.getAll('collectionId').filter((value): value is string => typeof value === 'string'),
    submittedAmounts: formData.getAll('submittedAmount').filter((value): value is string => typeof value === 'string'),
    idempotencyKey: field(formData, 'idempotencyKey'), returnTo: field(formData, 'returnTo'),
  });
  if (!parsed.success) redirect('/driver/marketplace?error=invalid_reconciliation');
  const supabase = await requireSupabase();
  const { data, error } = await (supabase as any).rpc('create_my_cash_reconciliation_batch', {
    p_collection_ids: parsed.data.collectionIds, p_submitted_amounts_piastres: parsed.data.submittedAmounts,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) redirect(resultUrl(parsed.data.returnTo, 'error', 'reconciliation_failed'));
  const batchId = z.uuid().safeParse(data?.id);
  if (!batchId.success) redirect(resultUrl(parsed.data.returnTo, 'error', 'reconciliation_failed'));
  const { error: submitError } = await (supabase as any).rpc('submit_my_cash_reconciliation_batch', { p_batch_id: batchId.data });
  if (submitError) redirect(resultUrl(parsed.data.returnTo, 'error', 'reconciliation_failed'));
  revalidatePath(parsed.data.returnTo);
  redirect(resultUrl(parsed.data.returnTo, 'notice', 'reconciliation_created'));
}

export async function reviewCashReconciliationAction(formData: FormData): Promise<void> {
  const parsed = reconciliationDecisionSchema.safeParse({ batchId: field(formData, 'batchId'), accept: field(formData, 'accept'), notes: field(formData, 'notes'), returnTo: field(formData, 'returnTo') });
  if (!parsed.success) redirect('/admin/marketplace/orders?error=invalid_reconciliation');
  await requireMarketplaceAdminRole(['finance'], { nextPath: parsed.data.returnTo });
  const supabase = await requireSupabase();
  const { error } = await (supabase as any).rpc('review_cash_reconciliation_batch_as_admin', {
    p_batch_id: parsed.data.batchId, p_accept: parsed.data.accept === 'true', p_notes: parsed.data.notes ?? null,
  });
  if (error) redirect(resultUrl(parsed.data.returnTo, 'error', 'reconciliation_failed'));
  revalidatePath(parsed.data.returnTo);
  redirect(resultUrl(parsed.data.returnTo, 'notice', 'reconciliation_reviewed'));
}

export async function transitionCommissionStatementAction(formData: FormData): Promise<void> {
  const parsed = commissionTransitionSchema.safeParse({
    statementId: field(formData, 'statementId'), next: field(formData, 'next'),
    idempotencyKey: field(formData, 'idempotencyKey'), notes: field(formData, 'notes'),
    manualAdjustmentMinor: field(formData, 'manualAdjustmentMinor'), returnTo: field(formData, 'returnTo'),
  });
  if (!parsed.success) redirect('/admin/marketplace/orders?error=invalid_commission_transition');
  await requireMarketplaceAdminRole(['finance'], { nextPath: parsed.data.returnTo });
  const supabase = await requireSupabase();
  const { error } = await (supabase as any).rpc('transition_commission_statement_as_admin', {
    p_statement_id: parsed.data.statementId, p_next: parsed.data.next,
    p_idempotency_key: parsed.data.idempotencyKey, p_notes: parsed.data.notes ?? null,
    p_manual_adjustment_piastres: parsed.data.manualAdjustmentMinor ?? null,
  });
  if (error) {
    const code = /total_due_negative/u.test(error.message ?? '') ? 'commission_total_negative'
      : /adjustment_locked/u.test(error.message ?? '') ? 'commission_adjustment_locked'
        : /invalid_statement_transition/u.test(error.message ?? '') ? 'commission_transition_not_allowed'
          : 'commission_transition_failed';
    redirect(resultUrl(parsed.data.returnTo, 'error', code));
  }
  revalidatePath('/admin/marketplace/orders');
  revalidatePath(parsed.data.returnTo);
  redirect(resultUrl(parsed.data.returnTo, 'notice', 'commission_updated'));
}
