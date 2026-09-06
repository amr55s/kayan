import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

const migration = source('supabase/migrations/20260818175213_add_partial_marketplace_returns.sql');
const operations = source('lib/commerce/operations.ts');
const actions = source('lib/commerce/operations-actions.ts');
const detail = source('components/commerce-operations/order-detail.tsx');

test('partial returns persist bounded quantities and category-specific deadlines', () => {
  assert.match(migration, /create table public\.marketplace_return_category_policies/u);
  assert.match(migration, /change_of_mind_days integer not null default 14/u);
  assert.match(migration, /defect_days integer not null default 30/u);
  assert.match(migration, /create table public\.marketplace_return_requests/u);
  assert.match(migration, /create table public\.marketplace_return_request_items/u);
  assert.match(migration, /reason_code in \([\s\S]*?'change_of_mind'[\s\S]*?'defective'/u);
  assert.match(migration, /eligibility_deadline timestamptz not null/u);
});

test('request creation serializes an order and prevents cumulative over-return', () => {
  assert.match(migration, /create_my_marketplace_return_request\([\s\S]*?where id = p_order_id for update/u);
  assert.match(migration, /order by id for update/u);
  assert.match(migration, /request\.status in \('requested','approved','received'\)/u);
  assert.match(migration, /v_prior \+ v_item\.requested_quantity > v_item\.quantity/u);
  assert.match(migration, /return_quantity_exceeded/u);
  assert.match(migration, /unique \(customer_id, request_idempotency_key\)/u);
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*?return-request:/u);
});

test('review and receipt are idempotent, role-scoped, and item-set exact', () => {
  assert.match(migration, /create table public\.marketplace_return_mutations/u);
  assert.match(migration, /unique \(actor_user_id, idempotency_key\)/u);
  assert.match(migration, /review_my_marketplace_return_request\([\s\S]*?public\.is_marketplace_admin\(\) or public\.can_fulfill_store/u);
  assert.match(migration, /receive_my_marketplace_return_request\([\s\S]*?restock_item_set_mismatch/u);
  assert.match(migration, /request_hash <> v_hash[\s\S]*?return_idempotency_conflict/u);
  assert.match(migration, /revoke all on function[\s\S]*?grant execute on function public\.receive_my_marketplace_return_request/u);
});

test('receipt applies proportional append-only stock, coupon, commission, and cash effects', () => {
  assert.match(migration, /v_merchant_target := case[\s\S]*?v_order\.merchant_discount_total::numeric \* v_cumulative_gross/u);
  assert.match(migration, /v_platform_target := case[\s\S]*?v_order\.platform_discount_total::numeric \* v_cumulative_gross/u);
  assert.match(migration, /update public\.inventory_stock set on_hand = on_hand \+ v_item\.requested_restock/u);
  assert.match(migration, /inventory_movement_references[\s\S]*?'order_return'/u);
  assert.match(migration, /marketplace_coupon_return_adjustments_immutable/u);
  assert.match(migration, /commission_ledger_one_reversal_per_return_idx/u);
  assert.match(migration, /'cod\.return-refund:' \|\| v_request\.id::text/u);
  assert.match(migration, /v_total_returned = v_total_ordered[\s\S]*?v_order\.delivery_fee/u);
  assert.match(migration, /status = 'returned', payment_status = 'refunded'/u);
});

test('return data stays participant-scoped and legacy full returns cannot overlap partial requests', () => {
  assert.match(migration, /marketplace_return_requests_read_participant/u);
  assert.match(migration, /public\.is_marketplace_admin\(\) or public\.can_fulfill_store\(store_id\)/u);
  assert.match(migration, /create or replace function public\.list_my_marketplace_return_requests/u);
  assert.match(migration, /role-scoped order DTO/u);
  assert.match(migration, /partial_return_flow_required/u);
  assert.match(migration, /set_my_marketplace_order_status_base_175213/u);
});

test('order contracts and forms expose deadline, reason, quantity, review, and restock flows', () => {
  assert.match(operations, /return_eligibility/u);
  assert.match(operations, /returned_quantity/u);
  assert.match(operations, /returnRequests:/u);
  assert.match(actions, /createPartialMarketplaceReturnAction/u);
  assert.match(actions, /reviewPartialMarketplaceReturnAction/u);
  assert.match(actions, /receivePartialMarketplaceReturnAction/u);
  assert.match(detail, /name="reasonCode"/u);
  assert.match(detail, /name="returnQuantity"/u);
  assert.match(detail, /changeOfMindDeadline/u);
  assert.match(detail, /name="restockQuantity"/u);
});
