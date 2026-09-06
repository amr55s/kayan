import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('commerce operations use authenticated role-checked RPCs only', async () => {
  const [queries, actions] = await Promise.all([
    read('lib/commerce/operations.ts'),
    read('lib/commerce/operations-actions.ts'),
  ]);
  assert.match(queries, /auth\.getUser\(\)/u);
  assert.match(queries, /list_my_marketplace_orders/u);
  assert.match(queries, /get_my_marketplace_order/u);
  assert.match(actions, /set_my_marketplace_order_status/u);
  assert.match(actions, /submit_product_review/u);
  assert.match(queries, /list_pending_marketplace_moderation/u);
  assert.match(queries, /list_my_marketplace_delivery_offers/u);
  assert.match(queries, /list_my_cod_collections/u);
  assert.match(queries, /list_my_cash_reconciliations/u);
  assert.match(queries, /list_my_commission_statements/u);
  assert.match(queries, /list_my_marketplace_support_threads/u);
  assert.match(actions, /respond_to_my_marketplace_delivery_offer/u);
  assert.match(actions, /review_cash_reconciliation_batch_as_admin/u);
  assert.match(queries, /list_all_commission_statements_as_admin/u);
  assert.match(actions, /transition_commission_statement_as_admin/u);
  assert.match(actions, /create_my_marketplace_support_thread/u);
  assert.doesNotMatch(`${queries}\n${actions}`, /createAdminClient|service_role|\.from\(['"]marketplace_orders/u);
});

test('delivery proof uses private upload, authenticated attachment, and authorized signed viewing', async () => {
  const [uploader, attach, view, detail] = await Promise.all([
    read('components/commerce-operations/delivery-proof-uploader.tsx'),
    read('app/api/marketplace/orders/[id]/delivery-proof/route.ts'),
    read('app/api/media/assets/[id]/view/route.ts'),
    read('components/commerce-operations/order-detail.tsx'),
  ]);
  assert.match(uploader, /purpose: 'delivery_proof'/u);
  assert.match(uploader, /SHA-256/u);
  assert.match(attach, /attach_my_marketplace_delivery_proof/u);
  assert.match(view, /authorize_my_private_marketplace_media/u);
  assert.match(view, /createPrivateMediaDownload/u);
  assert.match(detail, /proofAvailable/u);
  assert.doesNotMatch(`${uploader}\n${attach}\n${view}`, /public-read/u);
});

test('role routes are dynamic, guarded, and keep customer, merchant, admin and driver journeys on-site', async () => {
  const paths = [
    'app/account/orders/page.tsx',
    'app/account/orders/[id]/page.tsx',
    'app/merchant/marketplace/orders/page.tsx',
    'app/merchant/marketplace/orders/[id]/page.tsx',
    'app/admin/marketplace/orders/page.tsx',
    'app/admin/marketplace/orders/[id]/page.tsx',
    'app/driver/marketplace/page.tsx',
    'app/driver/marketplace/[id]/page.tsx',
  ];
  const sources = await Promise.all(paths.map(read));
  for (const source of sources) assert.match(source, /force-dynamic/u);
  assert.match(sources[2], /requireProfile\(\['merchant'\]\)/u);
  assert.match(sources[4], /requireMarketplaceAdminRole\(/u);
  assert.match(sources[6], /requireProfile\(\['driver'\]\)/u);
  assert.doesNotMatch(sources.join('\n'), /wa\.me|api\.whatsapp|chat\.whatsapp|href=["']tel:/iu);
});

test('customer review and return forms enforce bounded, verified-purchase workflows', async () => {
  const [view, actions] = await Promise.all([
    read('components/commerce-operations/order-detail.tsx'),
    read('lib/commerce/operations-actions.ts'),
  ]);
  assert.match(view, /order\.status === 'delivered'/u);
  assert.match(view, /return_requested/u);
  assert.match(view, /name="rating"/u);
  assert.match(actions, /\.int\(\)\.min\(1\)\.max\(5\)/u);
  assert.match(actions, /verified_purchase_required/u);
  assert.match(actions, /reason_required/u);
});
