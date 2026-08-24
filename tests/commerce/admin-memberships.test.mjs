import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL(
  '../../supabase/migrations/20260818180000_granular_admin_memberships.sql', import.meta.url,
), 'utf8');
const adapter = readFileSync(new URL('../../lib/admin/marketplace-memberships.ts', import.meta.url), 'utf8');
const action = readFileSync(new URL(
  '../../app/admin/marketplace/memberships/actions.ts', import.meta.url,
), 'utf8');
const page = readFileSync(new URL(
  '../../app/admin/marketplace/memberships/page.tsx', import.meta.url,
), 'utf8');
const panel = readFileSync(new URL(
  '../../components/marketplace/admin-memberships-panel.tsx', import.meta.url,
), 'utf8');
const operationsPage = readFileSync(new URL(
  '../../app/admin/marketplace/orders/page.tsx', import.meta.url,
), 'utf8');

test('granular admin roles are additive and existing admins are backfilled safely', () => {
  for (const role of ['super_admin', 'operations', 'support', 'finance', 'catalog_reviewer']) {
    assert.match(migration, new RegExp(`'${role}'`, 'u'));
  }
  assert.match(migration, /create table public\.admin_memberships/u);
  assert.match(migration, /from public\.profiles as profile\s+where profile\.role = 'admin'/u);
  assert.match(migration, /on conflict \(user_id, role\) do update set is_active = true/u);
});

test('authorization requires AAL2 membership and uses transaction-scoped capability', () => {
  assert.match(migration, /create or replace function public\.has_marketplace_admin_role/u);
  assert.match(migration, /auth\.jwt\(\) ->> 'aal'\), 'aal1'\) = 'aal2'/u);
  assert.match(migration, /create table public\.marketplace_admin_capability_context/u);
  assert.match(migration, /context\.transaction_id = txid_current\(\)/u);
  assert.match(migration, /public\.has_marketplace_admin_role\(array\['super_admin'\]/u);
});

test('last super admin and membership mutation invariants are concurrency safe', () => {
  assert.match(migration, /guard_last_marketplace_super_admin/u);
  assert.match(migration, /profiles_keep_marketplace_super_admin/u);
  assert.match(migration, /pg_advisory_xact_lock/u);
  assert.match(migration, /last_super_admin_cannot_be_removed/u);
  assert.match(migration, /admin_membership_version_conflict/u);
  assert.match(migration, /admin_membership_idempotency_conflict/u);
  assert.match(migration, /admin\.membership_changed/u);
});

test('database RPCs activate only the matching admin capability', () => {
  assert.match(migration, /\['super_admin','catalog_reviewer'\]/u);
  assert.match(migration, /\['super_admin','operations'\]/u);
  assert.match(migration, /review_my_marketplace_return_request_base_180000/u);
  assert.match(migration, /\['super_admin','support'\]/u);
  assert.match(migration, /\['super_admin','finance'\]/u);
  assert.match(migration, /list_marketplace_delivery_zones_for_admin_base_180000/u);
  assert.match(migration, /array\['super_admin'\]::public\.marketplace_admin_role\[\]/u);
});

test('membership tables are RPC-only and internal implementations stay private', () => {
  assert.match(migration, /alter table public\.admin_memberships enable row level security/u);
  assert.match(migration, /revoke all on table public\.admin_memberships/u);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete|all).*admin_memberships.*authenticated/iu);
  assert.match(migration, /procedure\.proname like '%\\_base\\_180000'/u);
  assert.match(migration, /grant execute on function public\.save_marketplace_admin_membership/u);
});

test('server adapter and UI require super admin and submit bounded role values', () => {
  assert.match(adapter, /requireMarketplaceAdminRole/u);
  assert.match(adapter, /await requireAdminAal2/u);
  assert.match(action, /form\.getAll\('roles'\)/u);
  assert.match(action, /requestedRoles\.length !== new Set\(requestedRoles\)\.size/u);
  assert.match(page, /requireMarketplaceAdminRole\(\['super_admin'\]/u);
  assert.match(panel, /لا يمكن تعطيل آخر مدير كامل/u);
  assert.doesNotMatch(panel, /dangerouslySetInnerHTML/u);
});

test('operations dashboard fetches and renders only assigned sections', () => {
  assert.match(operationsPage, /roles\.includes\('operations'\)/u);
  assert.match(operationsPage, /roles\.includes\('catalog_reviewer'\)/u);
  assert.match(operationsPage, /roles\.includes\('finance'\)/u);
  assert.match(operationsPage, /roles\.includes\('support'\)/u);
  assert.match(operationsPage, /canOperate \? listMyMarketplaceOrders/u);
  assert.match(operationsPage, /canReview \? <ModerationQueue/u);
});
