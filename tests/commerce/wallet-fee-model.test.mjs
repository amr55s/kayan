import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261002150000_marketplace_wallet_fee_model.sql');

const newTables = [
  'marketplace_fee_settings',
  'marketplace_subscription_plans',
  'merchant_wallets',
  'merchant_wallet_topup_requests',
  'merchant_wallet_entries',
  'marketplace_free_order_claims',
  'store_contacts',
];

test('every wallet table is deny-all and reachable only through definer functions', () => {
  for (const table of newTables) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'u'), table);
  }
  const revoke = migration.slice(migration.indexOf('revoke all on table'));
  for (const table of newTables) assert.match(revoke.slice(0, 600), new RegExp(`public\\.${table}`, 'u'), table);
  assert.match(revoke.slice(0, 600), /from public, anon, authenticated/u);
  assert.doesNotMatch(migration, /create policy [a-z_]+ on public\.(?:merchant_wallet|marketplace_fee|store_contacts)/u);

  const definers = [...migration.matchAll(/create or replace function public\.([a-z_]+)\(/gu)].map((match) => match[1]);
  assert.ok(definers.length >= 20);
  for (const name of definers) {
    const start = migration.indexOf(`create or replace function public.${name}(`);
    const header = migration.slice(start, migration.indexOf('as $$', start));
    assert.match(header, /set search_path = ''/u, `${name} must pin search_path`);
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\(`, 'u'), `${name} must not be public`);
  }
  assert.doesNotMatch(migration, /grant execute on function [^;]+ to (?:anon|public)/u);
});

test('the fee is charged once, at acceptance, inside the status transition', () => {
  assert.match(migration, /create trigger marketplace_orders_charge_fee\s+before update of status on public\.marketplace_orders/u);
  assert.match(migration, /old\.status = 'pending_confirmation' and new\.status = 'confirmed'/u);
  assert.match(migration, /for update;/u);
  assert.match(migration, /raise exception 'wallet_balance_insufficient'/u);
  assert.match(migration, /create unique index merchant_wallet_entries_one_charge_per_order_idx/u);
  assert.match(migration, /balance_piastres bigint not null default 0 check \(balance_piastres >= 0\)/u);
  // Subscription first, then the free allowance, and only then the balance.
  const charge = migration.slice(migration.indexOf('function public.charge_marketplace_order_fee'));
  const subscriptionBranch = charge.indexOf("v_merchant_id, 'subscription_order', 0");
  const freeBranch = charge.indexOf("v_merchant_id, 'free_order', 0");
  const paidBranch = charge.indexOf("v_merchant_id, 'order_fee', -v_fee");
  assert.ok(subscriptionBranch > 0 && subscriptionBranch < freeBranch && freeBranch < paidBranch);
});

test('free orders follow the phone number, not the account', () => {
  assert.match(migration, /create table public\.marketplace_free_order_claims/u);
  assert.match(migration, /function public\.merchant_contact_fingerprints/u);
  assert.match(migration, /greatest\(\s*coalesce\(\(select wallet\.free_orders_used/u);
  assert.match(migration, /function public\.list_duplicate_merchant_signals_as_admin/u);
  // Claims carry no foreign key, so deleting a merchant cannot reset the allowance.
  const claims = migration.slice(
    migration.indexOf('create table public.marketplace_free_order_claims'),
    migration.indexOf('create table public.store_contacts'),
  );
  assert.doesNotMatch(claims, /references/u);
});

test('customer details stay hidden from the store until it accepts', () => {
  assert.match(migration, /drop policy marketplace_orders_read_participant on public\.marketplace_orders/u);
  assert.match(migration, /public\.marketplace_order_is_accepted\(status, confirmed_at\)/u);
  assert.match(migration, /alter function public\.get_my_marketplace_order\(uuid\) rename to get_my_marketplace_order_base_150000/u);
  assert.match(migration, /if not v_accepted and not v_is_customer and not v_is_admin then/u);
  assert.match(migration, /'address', pg_catalog\.jsonb_build_object\('redacted', true\)/u);
  assert.match(migration, /if v_accepted and \(v_is_customer or v_is_admin\) then/u);

  const detail = read('components/commerce-operations/order-detail.tsx');
  assert.match(detail, /order\.address\.redacted && !order\.accepted && role !== 'customer'/u);
  assert.match(detail, /role === 'customer' && order\.accepted && order\.storeContact/u);
});

test('top-up proofs live in a private bucket with path-scoped policies', () => {
  assert.match(migration, /values \('wallet-topup-proofs', 'wallet-topup-proofs', false, 4194304/u);
  assert.match(migration, /create policy wallet_topup_proofs_insert on storage\.objects\s+for insert to authenticated/u);
  assert.match(migration, /create policy wallet_topup_proofs_read on storage\.objects\s+for select to authenticated/u);
  assert.doesNotMatch(migration, /wallet_topup_proofs_(?:update|delete)/u);
  assert.match(migration, /object\.bucket_id = 'wallet-topup-proofs' and object\.name = p_proof_path/u);

  const actions = read('app/merchant/marketplace/wallet/actions.ts');
  assert.match(actions, /function sniffImage/u);
  assert.match(actions, /proof\.size > WALLET_PROOF_MAX_BYTES/u);
  assert.match(actions, /upsert: false/u);
  assert.doesNotMatch(actions, /createAdminClient|service_role/u);

  const proofRoute = read('app/admin/marketplace/wallets/proofs/[id]/route.ts');
  assert.match(proofRoute, /requireMarketplaceAdminRole\(\['finance'\]/u);
  assert.match(read('lib/commerce/wallet.ts'), /createSignedUrl\(path, 120\)/u);
});

test('finance functions require an admin role and write an audit trail', () => {
  for (const name of [
    'review_wallet_topup_request_as_admin',
    'adjust_merchant_wallet_as_admin',
    'save_marketplace_fee_settings_as_admin',
    'save_marketplace_subscription_plan_as_admin',
    'get_marketplace_wallet_admin_overview',
  ]) {
    const start = migration.indexOf(`create or replace function public.${name}(`);
    const body = migration.slice(start, migration.indexOf('$$;', start));
    assert.match(body, /activate_marketplace_admin_capability\(\s*array\['super_admin', 'finance'\]/u, name);
  }
  assert.match(migration, /'wallet\.topup_approved'/u);
  assert.match(migration, /'wallet\.adjusted'/u);
  assert.match(migration, /raise exception 'topup_already_reviewed'/u);

  const adminActions = read('app/admin/marketplace/wallets/actions.ts');
  assert.match(adminActions, /requireMarketplaceAdminRole\(\['finance'\]/u);
});

test('stores deliver themselves and the 7% commission is retired', () => {
  assert.match(migration, /create trigger commission_ledger_skip_when_wallet_model/u);
  assert.match(migration, /raise exception 'platform_delivery_unavailable'/u);
  assert.match(migration, /alter table public\.stores alter column delivery_mode set default 'self'/u);
  const panels = read('components/marketplace/operational-setup-panels.tsx');
  assert.doesNotMatch(panels, /<option value="platform">/u);
});

test('the release marker follows the wallet migration and the app expects it', () => {
  const marker = read('supabase/migrations/20261002150100_wallet_fee_model_release_marker.sql');
  assert.match(marker, /'version', '20261002150100'/u);
  assert.match(marker, /'get_my_merchant_wallet'/u);
  assert.match(marker, /to_regclass\('public\.merchant_wallets'\) is null/u);
  assert.match(read('app/api/health/ready/route.ts'), /EXPECTED_SCHEMA_VERSION = '20261002150100'/u);
});

test('merchant and admin screens are wired to the wallet', () => {
  const shell = read('components/marketplace/authenticated-marketplace-shell.tsx');
  assert.match(shell, /href: '\/merchant\/marketplace\/wallet'/u);
  assert.match(read('app/merchant/marketplace/page.tsx'), /<StoreLaunchChecklist/u);
  assert.match(read('app/admin/marketplace/page.tsx'), /redirect\('\/admin\/marketplace\/dashboard'\)/u);
  assert.match(read('app/admin/marketplace/dashboard/page.tsx'), /requireMarketplaceAdminRole\(/u);
  assert.match(read('lib/commerce/operations-actions.ts'), /wallet_balance_insufficient/u);
  const exportRoute = read('app/merchant/marketplace/orders/export/route.ts');
  assert.match(exportRoute, /profile\.role !== 'merchant'/u);
  assert.match(exportRoute, /\^\[=\+\\-@\\t\\r\]/u);
});
