import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'libpg-query';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260830175005_activity_resource_authorization.sql');

test('activity authorization migration and transactional RLS regression are valid PostgreSQL syntax', async () => {
  await parse(migration);
  await parse(read('supabase/tests/activity_resource_authorization.sql'));
});

test('resource helpers require independent approval and never use selected UI workspace as authority', () => {
  const helpers = migration.split('-- Preserve the existing')[0];
  assert.match(helpers, /create schema if not exists activity_private/);
  assert.match(helpers, /w\.status='approved'/);
  assert.match(helpers, /m\.is_active/);
  assert.doesNotMatch(helpers, /profiles\.role\s*=\s*'merchant'|user_metadata|dairtak_workspace/);
  assert.match(helpers, /not exists\(select 1 from public.activity_workspaces w where w.store_id=s.id\)/);
  assert.match(helpers, /revoke all on function activity_private.driver_is_approved/);
  assert.match(helpers, /grant execute on function public.has_my_activity_access\(text\) to authenticated/);
});

test('renamed audited RPC bases retain the AAL2 wrapper chain and resource checks', () => {
  for (const name of ['set_delivery_order_status_base_174408', 'set_my_marketplace_order_status_base_175213', 'offer_marketplace_delivery_to_driver_as_caller_base_180000']) {
    assert.match(migration, new RegExp(`function public\\.${name}\\(`));
  }
  assert.match(migration, /perform public.require_marketplace_admin_fallback\(v_non_admin\)/);
  assert.doesNotMatch(migration, /^grant\s[^;]*base_(?:174408|175213|180000)/m);
  assert.doesNotMatch(migration, /create or replace function public.current_profile/);
});

test('page and action guards return actual profile and resolve merchant resources independently', () => {
  const guards = read('lib/auth/guards.ts');
  assert.match(guards, /rpc\('has_my_activity_access'/);
  assert.doesNotMatch(guards, /\.\.\.profile,\s*role|profile\.role\s*=(?!=)/);
  assert.match(read('app/merchant/page.tsx'), /\.eq\('merchant_id', workspace.merchantId\)/);
  const resolver = read('lib/onboarding/workspace-access.ts');
  assert.match(resolver, /get\('dairtak_workspace'\)/);
  assert.match(resolver, /rpc\('can_manage_merchant'/);
  assert.match(resolver, /allowed === true/);
});
