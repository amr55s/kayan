import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith('_add_marketplace_commerce_foundation.sql'),
);

assert.ok(migrationName, 'commerce migration must exist');
const sql = readFileSync(join(migrationsDir, migrationName), 'utf8');

test('commerce migration is ordered after the security hotfix and is one transaction', () => {
  assert.equal(migrationName, '20260810070000_add_marketplace_commerce_foundation.sql');
  assert.ok('20260810070000' > '20260810060942');
  assert.equal((sql.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^commit;$/gm) ?? []).length, 1);
  assert.ok(sql.lastIndexOf('commit;') > sql.lastIndexOf('grant execute on function'));
  assert.ok(
    sql.indexOf('create or replace function public.is_marketplace_admin') <
      sql.indexOf('create policy marketplace_customers_read_own'),
    'authorization helpers must exist before policies reference them',
  );
});

test('all exposed marketplace tables have RLS and default privileges are revoked', () => {
  const tables = [...sql.matchAll(/create table public\.([a-z0-9_]+)\s*\(/g)].map((match) => match[1]);
  const rlsBlock = sql.slice(
    sql.indexOf("foreach table_name in array array[", sql.indexOf('Row-level security')),
    sql.indexOf('revoke all on sequence'),
  );
  for (const table of tables) {
    assert.match(rlsBlock, new RegExp(`'${table}'`), `${table} must be in the RLS allowlist`);
  }
  assert.match(rlsBlock, /enable row level security/);
  assert.match(rlsBlock, /revoke all on table public\.%I from public, anon, authenticated/);
  assert.doesNotMatch(
    sql,
    /grant (?:select|insert|update|delete|all)[^;]*marketplace_(?:runtime_settings|catalog_mutations|outbox)[^;]*to authenticated/is,
  );
});

test('security definer routines use an empty search path and an explicit execute allowlist', () => {
  const routines = [...sql.matchAll(/create or replace function public\.([a-z0-9_]+)\s*\(/g)].map(
    (match) => match[1],
  );
  for (const match of sql.matchAll(/security definer/g)) {
    assert.equal(sql.slice(match.index, match.index + 80).includes("set search_path = ''"), true);
  }
  const revokeBlock = sql.slice(sql.indexOf("procedure.proname = any(array["), sql.indexOf('grant execute on function public.is_marketplace_admin'));
  for (const routine of new Set(routines)) {
    assert.match(revokeBlock, new RegExp(`'${routine}'`), `${routine} must be revoked before allowlisting`);
  }
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.(?:checkout_marketplace_cart|preview_marketplace_checkout|set_marketplace_order_status|reorder_marketplace_media|delete_marketplace_media|create_cash_reconciliation_batch|review_cash_reconciliation_batch)\([^;]+to authenticated/is,
  );
});

test('checkout is auth-bound, idempotent, COD-only, and snapshots delivery notes', () => {
  assert.match(sql, /payment_method text not null default 'cod' check \(payment_method = 'cod'\)/);
  assert.match(sql, /delivery_notes text check \([\s\S]*char_length\(delivery_notes\) between 1 and 500/);
  assert.match(sql, /p_delivery_notes text default null/);
  assert.match(sql, /delivery_notes_too_long/);
  assert.match(sql, /coalesce\(p_delivery_notes, '-'\)/);
  assert.match(sql, /v_group\.delivery_notes,[\s\S]*v_store_subtotal/);
  assert.match(
    sql,
    /grant execute on function public\.checkout_my_marketplace_cart\(uuid, text, uuid, jsonb, text\)/,
  );
  assert.match(sql, /max_open_order_groups/);
  assert.match(sql, /max_first_order_units/);
  assert.match(sql, /max_first_order_amount_piastres/);
  assert.match(sql, /coupon_minimum_order_not_met/);
  assert.match(sql, /funding_owner = 'platform'/);
});

test('catalog mutations are auth-bound, idempotent, optimistic, and preserve moderation', () => {
  for (const routine of [
    'get_my_marketplace_product',
    'list_my_marketplace_products',
    'create_my_marketplace_product',
    'update_my_marketplace_product',
    'archive_my_marketplace_product',
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${routine}`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${routine}`));
  }
  assert.match(sql, /create table public\.marketplace_catalog_mutations/);
  assert.match(sql, /unique \(actor_user_id, idempotency_key\)/);
  assert.match(sql, /catalog_idempotency_conflict/);
  assert.match(sql, /product_version_conflict/);
  assert.match(sql, /new\.status := 'draft'/);
  assert.match(sql, /products_store_product_key_idx/);
  assert.match(sql, /product_variants_store_sku_idx/);
  assert.match(sql, /exactly_one_active_default_variant_required/);
  assert.match(sql, /inventory_below_reserved/);
  assert.match(sql, /p_stock text default null/);
  assert.match(sql, /'stock_status', page\.stock_status/);
  assert.match(sql, /with variant_rollup as materialized/);
});

test('active products, delivery proof, ratings, and cash ledgers keep hard invariants', () => {
  assert.match(sql, /create constraint trigger product_images_enforce_active_product/);
  assert.match(sql, /create constraint trigger product_variants_enforce_active_product/);
  assert.match(sql, /deferrable initially deferred/);
  assert.match(sql, /active_product_description_required/);
  assert.match(sql, /active_product_image_required/);
  assert.match(sql, /active_product_variant_required/);
  assert.match(sql, /delivery_proof_is_immutable/);
  assert.match(sql, /if p_asset_id is null then[\s\S]*delivery_proof_required/);
  assert.match(sql, /update public\.product_rating_aggregates[\s\S]*rating_sum = rating_sum \+ p_sum_delta/);
  assert.match(sql, /create table public\.cash_ledger_entries/);
  assert.match(sql, /create trigger cash_ledger_entries_immutable/);
  assert.match(sql, /create or replace function public\.review_cash_reconciliation_batch/);
  assert.match(sql, /return_window_days', 14/);
});

test('hosted maintenance and exact schema readiness marker are installed', () => {
  assert.match(sql, /create extension if not exists pg_cron/);
  assert.match(sql, /select cron\.schedule\([\s\S]*'\*\/5 \* \* \* \*'/);
  assert.match(sql, /'schema_version'[\s\S]*'version', '20260810070000'/);
  assert.match(sql, /'name', 'marketplace_commerce_foundation'/);
});

test('Excel imports are bounded, auth-bound, staged, atomic, and no-delete', () => {
  for (const routine of [
    'create_my_catalog_import_file',
    'begin_my_catalog_import',
    'apply_my_catalog_import',
    'finalize_my_catalog_import',
    'fail_my_catalog_import',
    'get_my_catalog_import',
    'export_my_marketplace_catalog',
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${routine}`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${routine}`));
  }
  assert.match(sql, /pg_catalog\.pg_column_size\(p_plan\) > 67108864/);
  assert.match(sql, /invalid_import_file_metadata/);
  assert.match(sql, /v_product_count not between 1 and 5000/);
  assert.match(sql, /v_variant_count not between 1 and 20000/);
  assert.match(sql, /v_image_count not between 0 and 50000/);
  assert.match(sql, /import_idempotency_conflict/);
  assert.match(sql, /status = 'processing'/);
  assert.match(sql, /Omitted variants remain[\s\S]*never deleted/);
  assert.doesNotMatch(sql, /delete from public\.products/);
  assert.doesNotMatch(sql, /delete from public\.product_variants/);
});

test('remote catalog images use a leased service worker with retry and dead-letter completion', () => {
  assert.match(sql, /create or replace function public\.claim_catalog_import_image_jobs\(/u);
  assert.match(sql, /for update of row skip locked/u);
  assert.match(sql, /worker_lease_expires_at/u);
  assert.match(sql, /create or replace function public\.complete_catalog_import_image_job\(/u);
  assert.match(sql, /create or replace function public\.fail_catalog_import_image_job\(/u);
  assert.match(sql, /worker_attempts >= 5/u);
  assert.match(sql, /'dead_letter'/u);
  assert.match(sql, /catalog_import_position_replaced/u);
  assert.match(sql, /'media\.delete_requested:' \|\| v_previous_asset\.id::text/u);
  assert.match(sql, /select count\(\*\) into v_pending[\s\S]+sheet_name = 'Images' and status = 'valid'/u);
  assert.match(sql, /discard_my_catalog_import_file/u);
  assert.match(sql, /catalog\.import_file_delete_requested/u);
  assert.doesNotMatch(sql, /grant execute on function public\.claim_catalog_import_image_jobs[\s\S]{0,100}to authenticated/iu);
});

test('commission monetization lifecycle is admin-only, idempotent, audited, and non-negative', () => {
  assert.match(sql, /create table public\.commission_statement_mutations/u);
  assert.match(sql, /create or replace function public\.list_all_commission_statements_as_admin\(/u);
  assert.match(sql, /create or replace function public\.transition_commission_statement_as_admin\(/u);
  assert.match(sql, /pg_advisory_xact_lock/u);
  assert.match(sql, /v_statement\.status = 'draft' and p_next in \('issued', 'void'\)/u);
  assert.match(sql, /v_statement\.status = 'issued' and p_next in \('paid', 'disputed', 'void'\)/u);
  assert.match(sql, /v_statement\.status = 'disputed' and p_next in \('issued', 'void'\)/u);
  assert.match(sql, /statement_total_due_negative/u);
  assert.match(sql, /check \(status = 'draft' or total_due >= 0\)/u);
  assert.match(sql, /commission\.statement_transitioned/u);
  assert.match(sql, /grant execute on function public\.transition_commission_statement_as_admin/u);
  assert.doesNotMatch(sql, /grant execute on function public\.generate_my_commission_statement\(uuid, date\) to authenticated/u);
});

test('customer, merchant, admin, and driver order DTOs are role-scoped', () => {
  assert.match(sql, /create or replace function public\.get_my_marketplace_order\(p_order_id uuid\)/);
  assert.match(sql, /create or replace function public\.list_my_marketplace_orders/);
  assert.match(sql, /public\.can_fulfill_store\(v_order\.store_id\)/);
  assert.match(sql, /assignment\.driver_id = v_actor_id/);
  assert.match(sql, /customer\.auth_user_id = v_actor_id/);
  assert.match(sql, /create_my_cash_reconciliation_batch/);
  assert.match(sql, /review_cash_reconciliation_batch_as_admin/);
});

test('private delivery proof never receives a public CDN URL', () => {
  assert.match(sql, /visibility text not null default 'public'/);
  assert.match(sql, /entity_type not in \('product', 'store'\) and visibility = 'private' and public_url is null/);
  assert.match(sql, /create or replace function public\.create_my_delivery_proof_upload_session/);
  assert.match(sql, /create or replace function public\.get_private_marketplace_media_locator/);
  assert.match(sql, /create or replace function public\.authorize_my_private_marketplace_media/);
  assert.doesNotMatch(sql, /'proof_url', asset\.public_url/);
  assert.match(sql, /'proof_available', assignment\.proof_asset_id is not null/);
  assert.match(sql, /visibility = 'public'[\s\S]*entity_type in \('product', 'store'\)/);
});

test('operations APIs expose bounded role-scoped DTOs', () => {
  for (const routine of [
    'list_pending_marketplace_moderation',
    'offer_marketplace_delivery_to_driver_as_caller',
    'list_my_marketplace_delivery_offers',
    'respond_to_my_marketplace_delivery_offer',
    'list_my_cod_collections',
    'list_my_cash_reconciliations',
    'get_my_cash_reconciliation',
    'list_my_commission_statements',
    'get_my_commission_statement',
    'create_my_marketplace_support_thread',
    'list_my_marketplace_support_threads',
    'get_my_marketplace_support_thread',
    'reply_my_marketplace_support_thread',
    'close_my_marketplace_support_thread',
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${routine}`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${routine}`));
  }
  assert.match(sql, /'next_before'/);
  assert.match(sql, /'unread_count'/);
  assert.match(sql, /'author_role', message\.sender_kind/);
  assert.doesNotMatch(sql, /'author_name'/);
});
