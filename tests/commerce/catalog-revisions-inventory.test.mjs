import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260810076000_catalog_revisions_inventory.sql', import.meta.url),
  'utf8',
);
const merchantAdapter = readFileSync(
  new URL('../../lib/commerce/merchant-products.ts', import.meta.url),
  'utf8',
);
const merchantEditor = readFileSync(
  new URL('../../components/marketplace/merchant/product-editor.tsx', import.meta.url),
  'utf8',
);
const mediaFinalizeRoute = readFileSync(
  new URL('../../app/api/media/uploads/[id]/finalize/route.ts', import.meta.url),
  'utf8',
);

test('post-publication catalog changes are immutable reviewed snapshots', () => {
  assert.match(migration, /^begin;$/mu);
  assert.match(migration, /^commit;$/mu);
  assert.match(migration, /create table public\.product_revisions/u);
  assert.match(migration, /status in \('pending', 'approved', 'rejected'\)/u);
  assert.match(migration, /create unique index product_revisions_one_pending_idx/u);
  assert.match(migration, /product_revision_snapshot_is_immutable/u);
  assert.match(migration, /product_revisions_immutable/u);
  assert.match(migration, /product_revision_base_conflict/u);
  assert.match(migration, /product_revision_apply_context/u);
  assert.match(migration, /created_by uuid references auth\.users\(id\) on delete set null/u);
  assert.match(migration, /reviewed_by uuid references auth\.users\(id\) on delete set null/u);
  assert.match(migration, /unique \(product_id, idempotency_key\)/u);
  assert.match(migration, /old\.created_by is not null and new\.created_by is null/u);
  assert.match(migration, /old\.reviewed_by is not null and new\.reviewed_by is null/u);
  assert.doesNotMatch(migration, /created_by uuid not null references auth\.users/u);
  assert.doesNotMatch(migration, /created_by uuid[^\n]+on delete restrict/u);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all).*product_revisions.*authenticated/iu);
});

test('sensitive active product fields cannot leak through direct update paths', () => {
  assert.match(migration, /products_stage_active_sensitive_changes/u);
  assert.match(migration, /new\.category_id := old\.category_id/u);
  assert.match(migration, /new\.product_key := old\.product_key/u);
  assert.match(migration, /new\.slug := old\.slug/u);
  assert.match(migration, /new\.name := old\.name/u);
  assert.match(migration, /new\.description := old\.description/u);
  assert.match(migration, /new\.brand := old\.brand/u);
  assert.match(migration, /active_product_images_require_revision/u);
});

test('manual and Excel media flows stage active product images', () => {
  assert.match(migration, /create or replace function public\.finalize_media_upload/u);
  assert.match(migration, /'media-finalize:' \|\| v_session\.id::text/u);
  assert.match(migration, /create or replace function public\.reorder_my_marketplace_media/u);
  assert.match(migration, /create or replace function public\.delete_my_marketplace_media/u);
  assert.match(migration, /complete_catalog_import_image_job_base_76000/u);
  assert.match(migration, /'catalog-image:' \|\| v_row\.id::text/u);
  assert.match(migration, /images_pending_moderation/u);
  assert.match(migration, /pending_revision/u);
  assert.match(mediaFinalizeRoute, /\.from\('product_revisions'\)/u);
  assert.match(mediaFinalizeRoute, /revisionPosition/u);
});

test('moderation queue reviews latest active-product revision through the existing action', () => {
  assert.match(migration, /create or replace function public\.moderate_product_revision/u);
  assert.match(migration, /create or replace function public\.moderate_product_as_admin/u);
  assert.match(migration, /'pending_revision'/u);
  assert.match(migration, /approved_product_revision/u);
  assert.match(migration, /product\.revision_approved/u);
  assert.match(migration, /product\.revision_rejected/u);
});

test('inventory changes are captured in an append-only tenant-scoped ledger', () => {
  assert.match(migration, /create table public\.inventory_movements/u);
  assert.match(migration, /'inventory-opening:' \|\| stock\.variant_id::text/u);
  assert.match(migration, /after insert or update of on_hand, reserved on public\.inventory_stock/u);
  assert.match(migration, /checkout_reserved/u);
  assert.match(migration, /order_confirmed/u);
  assert.match(migration, /reservation_released/u);
  assert.match(migration, /order_cancelled_or_returned/u);
  assert.match(migration, /inventory_movements_are_append_only/u);
  assert.match(migration, /old\.actor_user_id is not null and new\.actor_user_id is null/u);
  assert.match(migration, /create table public\.inventory_movement_references/u);
  assert.match(migration, /after insert or update of status on public\.inventory_reservations/u);
  assert.match(migration, /inventory_movement_references_immutable/u);
  assert.match(migration, /inventory_movements_read_catalog_or_admin/u);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all).*inventory_movements.*authenticated/iu);
});

test('merchant editor makes pending moderation explicit without exposing draft snapshots publicly', () => {
  assert.match(merchantAdapter, /pending_revision/u);
  assert.match(merchantAdapter, /pendingRevision:/u);
  assert.match(merchantEditor, /viewModel\.pendingRevision/u);
  assert.match(merchantEditor, /تعديلات في انتظار مراجعة الإدارة/u);
});
