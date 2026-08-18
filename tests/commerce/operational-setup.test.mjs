import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const migration = await readFile(new URL('supabase/migrations/20260810075000_marketplace_operational_setup.sql', root), 'utf8');
const adapter = await readFile(new URL('lib/commerce/operational-setup.ts', root), 'utf8');
const merchantActions = await readFile(new URL('app/merchant/marketplace/setup-actions.ts', root), 'utf8');
const panels = await readFile(new URL('components/marketplace/operational-setup-panels.tsx', root), 'utf8');

test('operational migration is additive, transactional, and default-deny', () => {
  assert.match(migration, /^begin;/mu);
  assert.match(migration, /commit;\s*$/u);
  assert.match(migration, /alter table public\.marketplace_operational_mutations enable row level security;/u);
  assert.match(migration, /revoke all on table public\.marketplace_operational_mutations from public, anon, authenticated;/u);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all).*marketplace_operational_mutations.*authenticated/iu);
});

test('all operational writes are auth-bound RPCs with explicit grants', () => {
  const publicRpcs = [
    'create_my_marketplace_store', 'update_my_marketplace_store', 'submit_my_marketplace_store_operational',
    'save_marketplace_delivery_zone_as_admin', 'set_marketplace_delivery_zone_active_as_admin',
    'save_my_store_delivery_configuration', 'save_my_marketplace_coupon',
    'save_platform_marketplace_coupon_as_admin', 'deactivate_my_marketplace_coupon',
    'deactivate_platform_marketplace_coupon_as_admin',
  ];
  for (const name of publicRpcs) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}\\(`, 'u'));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(`, 'u'));
  }
  assert.match(migration, /v_actor_id uuid := \(select auth\.uid\(\)\)/u);
  assert.match(migration, /not public\.can_manage_(?:merchant|store)/u);
  assert.match(migration, /not public\.is_marketplace_admin\(\)/u);
  assert.match(migration, /not public\.can_catalog_store\(/u);
  assert.doesNotMatch(adapter, /\.from\(['"](?:stores|delivery_zones|store_delivery_zones|marketplace_coupons)['"]\)\.(?:insert|update|upsert|delete)/u);
});

test('store onboarding supports multiple stores without unbounded creation', () => {
  assert.match(migration, /status <> 'archived'\) >= 10/u);
  assert.match(migration, /created_at >= now\(\) - interval '24 hours'\) >= 3/u);
  assert.match(migration, /store_slug_taken/u);
  assert.match(migration, /insert into public\.store_memberships/u);
  assert.match(migration, /on conflict \(store_id, user_id\) do update/u);
  assert.match(merchantActions, /create_my_marketplace_store/u);
  assert.match(panels, /إنشاء أول متجر/u);
});

test('delivery configuration uses real zones and optimistic concurrency', () => {
  assert.match(migration, /from public\.delivery_zones as zone/u);
  assert.match(migration, /left join public\.store_delivery_zones as config/u);
  assert.match(migration, /p_expected_store_updated_at/u);
  assert.match(migration, /p_expected_config_updated_at/u);
  assert.match(migration, /v_store\.updated_at <> p_expected_store_updated_at/u);
  assert.match(migration, /v_config\.updated_at <> p_expected_config_updated_at/u);
  assert.match(panels, /طريقة التوصيل/u);
  assert.match(panels, /توصيل المنصة/u);
  assert.match(panels, /توصيل المتجر/u);
});

test('coupon scope and funding cannot be spoofed by form input', () => {
  assert.match(migration, /case when p_admin_scope then 'platform'::public\.marketplace_coupon_funding else 'merchant'::public\.marketplace_coupon_funding end/u);
  assert.match(migration, /p_store_id is not null/u);
  assert.match(migration, /exists \(select 1 from public\.marketplace_coupon_products/u);
  assert.match(migration, /exists \(select 1 from public\.marketplace_coupon_categories/u);
  assert.match(migration, /p_discount_percent > 80/u);
  assert.match(migration, /p_per_customer_limit not between 1 and 100/u);
  assert.doesNotMatch(merchantActions, /funding_owner/u);
});

test('operational UI imports HeroUI v3 directly and has no prohibited contact flow', () => {
  assert.match(panels, /from '@heroui\/react\/button'/u);
  assert.match(panels, /from '@heroui\/react\/input'/u);
  assert.doesNotMatch(panels, /heroui-compat/u);
  assert.doesNotMatch(`${panels}\n${merchantActions}`, /whatsapp|wa\.me|telegram/iu);
  assert.doesNotMatch(panels, /gradient/iu);
});
