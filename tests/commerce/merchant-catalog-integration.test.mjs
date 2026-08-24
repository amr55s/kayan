import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('merchant catalog mutations use auth-bound RPCs and concurrency tokens', () => {
  const catalog = read('lib/commerce/merchant-products.ts');
  const actions = read('app/merchant/marketplace/actions.ts');
  for (const rpc of [
    'list_my_marketplace_products', 'get_my_marketplace_product',
    'create_my_marketplace_product', 'update_my_marketplace_product',
    'archive_my_marketplace_product', 'submit_my_product_for_review',
    'reorder_my_marketplace_media', 'delete_my_marketplace_media',
  ]) assert.match(catalog, new RegExp(rpc));
  assert.match(catalog, /p_expected_updated_at/);
  assert.match(catalog, /p_idempotency_key/);
  assert.match(actions, /input\.idempotencyKey/);
  assert.doesNotMatch(catalog, /createAdminClient|service_role/i);
});

test('Excel persistence keeps workbooks private and writes through catalog RPCs', () => {
  const excel = read('lib/commerce/merchant-excel.ts');
  const prepareRoute = read('app/api/catalog-imports/files/route.ts');
  const exportRoute = read('app/merchant/marketplace/excel/export/route.ts');
  for (const rpc of [
    'create_my_catalog_import_file', 'begin_my_catalog_import',
    'get_my_catalog_import', 'apply_my_catalog_import', 'export_my_marketplace_catalog',
  ]) assert.match(excel, new RegExp(rpc));
  assert.match(excel, /imports\/\$\{context\.storeId\}\/\$\{input\.fileId\}\.xlsx/);
  assert.match(prepareRoute, /createPrivateStageUpload/);
  assert.match(prepareRoute, /create_my_catalog_import_file/);
  assert.match(prepareRoute, /consume_public_submission_rate_limit/);
  assert.match(prepareRoute, /p_limit: 20/);
  assert.match(prepareRoute, /retry-after': '3600'/);
  assert.match(prepareRoute, /discard_my_catalog_import_file/);
  assert.match(prepareRoute, /export async function DELETE/);
  assert.match(excel, /discard_my_catalog_import_file/);
  assert.match(prepareRoute, /imports\/\$\{context\.storeId\}\/\$\{fileId\}\.xlsx/);
  assert.match(excel, /headPrivateMediaObject/);
  assert.match(excel, /readPrivateMediaObject/);
  assert.doesNotMatch(excel, /createAdminClient|service_role/i);
  assert.doesNotMatch(excel, /\.from\([^)]*\)[\s\S]{0,120}\.(?:insert|update|delete|upsert)\(/);
  assert.match(exportRoute, /cache-control': 'private, no-store'/);
});
