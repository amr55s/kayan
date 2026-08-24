import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const migration = read('supabase/migrations/20260818180715_add_store_branches.sql');
const adapter = read('lib/commerce/operational-setup.ts');
const actions = read('app/merchant/marketplace/setup-actions.ts');
const panel = read('components/marketplace/operational-setup-panels.tsx');
const page = read('app/merchant/marketplace/settings/page.tsx');
const docs = read('docs/store-branches-v1.md');

test('branch rollout is additive, backfills every store and fixes v1 inventory scope', () => {
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/u);
  assert.match(migration, /create table public\.store_branches/u);
  assert.match(migration, /create table public\.branch_delivery_zones/u);
  assert.match(migration, /from public\.stores as store[\s\S]*on conflict \(store_id, code\) do nothing/u);
  assert.match(migration, /fulfillment_inventory_scope_v1/u);
  assert.match(migration, /'inventory_scope', 'store'/u);
  assert.match(docs, /inventory shared at the[\s\S]*store level/u);
  assert.doesNotMatch(migration, /branch_inventory|inventory_stock[\s\S]*branch_id/u);
});

test('branch and delivery writes are tenant scoped, optimistic and idempotent', () => {
  for (const rpc of [
    'save_my_store_branch',
    'delete_my_store_branch',
    'save_my_branch_delivery_configuration',
  ]) assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`, 'u'));
  assert.match(migration, /not public\.can_manage_store\(p_store_id\)/u);
  assert.match(migration, /marketplace_operational_replay/u);
  assert.match(migration, /marketplace_record_operational_mutation/u);
  assert.match(migration, /version_conflict/u);
  assert.match(migration, /default_branch_cannot_be_deleted/u);
  assert.match(migration, /branch_limit_reached/u);
  assert.match(migration, /marketplace_audit_log/u);
});

test('checkout selects and locks a deterministic server-side branch snapshot', () => {
  assert.match(migration, /checkout_marketplace_cart_base_180715/u);
  assert.match(migration, /where id = p_cart_id and customer_id = p_customer_id for update/u);
  assert.match(migration, /order by store\.id[\s\S]*for key share of store/u);
  assert.match(migration, /marketplace_orders_assign_branch/u);
  assert.match(migration, /order by branch\.is_default desc, branch\.sort_order, branch\.id/u);
  assert.match(migration, /for key share of branch, config/u);
  assert.match(migration, /new\.branch_id := v_branch\.id/u);
  assert.match(migration, /new\.branch_snapshot := jsonb_build_object/u);
  assert.match(migration, /alter column branch_snapshot set not null/u);
  assert.match(migration, /order_branch_snapshot_immutable/u);
  assert.match(
    migration,
    /create or replace function public\.checkout_marketplace_cart\(\s*p_customer_id uuid, p_cart_id uuid, p_idempotency_key text, p_address_id uuid,\s*p_delivery_modes jsonb default '\{\}'::jsonb, p_delivery_notes text default null\s*\)/u,
  );
});

test('legacy delivery configuration remains a synchronized fallback', () => {
  assert.match(migration, /selected_branch_id/u);
  assert.match(migration, /sync_store_delivery_zone_from_branches/u);
  assert.match(migration, /save_my_store_delivery_configuration_base_180715/u);
  assert.match(migration, /if coalesce\(\(v_response ->> 'idempotent'\)::boolean, false\)/u);
  assert.match(migration, /v_legacy public\.store_delivery_zones/u);
  assert.match(docs, /compatibility surface/u);
});

test('branch tables are default deny and expose only role-checked RPCs', () => {
  assert.match(migration, /alter table public\.store_branches enable row level security/u);
  assert.match(migration, /alter table public\.branch_delivery_zones enable row level security/u);
  assert.match(migration, /revoke all on table public\.store_branches, public\.branch_delivery_zones/u);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete|all)[^;]*authenticated/iu);
  assert.match(migration, /proname like '%\\_base\\_180715'/u);
  assert.doesNotMatch(migration, /grant execute on function public\.checkout_marketplace_cart\([\s\S]*?to authenticated/u);
});

test('merchant settings manages branches and bounded per-branch delivery', () => {
  assert.match(adapter, /list_my_store_branches/u);
  assert.match(adapter, /MarketplaceStoreBranch/u);
  assert.match(actions, /save_my_store_branch/u);
  assert.match(actions, /delete_my_store_branch/u);
  assert.match(actions, /save_my_branch_delivery_configuration/u);
  assert.match(actions, /new Set\(modes\)\.size/u);
  assert.match(panel, /BranchManagementPanel/u);
  assert.match(panel, /المخزون مشترك على مستوى المتجر/u);
  assert.match(page, /saveBranchDeliveryConfigurationAction/u);
  assert.doesNotMatch(`${actions}\n${panel}`, /wa\.me|api\.whatsapp|href=["']tel:/iu);
});
