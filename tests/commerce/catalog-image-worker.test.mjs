import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const worker = await readFile(new URL('../../lib/commerce/catalog-image-worker.ts', import.meta.url), 'utf8');
const route = await readFile(new URL('../../app/api/cron/import-images/route.ts', import.meta.url), 'utf8');
const maintenance = await readFile(new URL('../../app/api/cron/maintenance/route.ts', import.meta.url), 'utf8');
const migration = await readFile(
  new URL('../../supabase/migrations/20260810070000_add_marketplace_commerce_foundation.sql', import.meta.url),
  'utf8',
);

test('catalog image worker uses leased database queue and bounded concurrency', () => {
  assert.match(worker, /claim_catalog_import_image_jobs/u);
  assert.match(worker, /complete_catalog_import_image_job/u);
  assert.match(worker, /fail_catalog_import_image_job/u);
  assert.match(worker, /MAX_CONCURRENCY = 2/u);
  assert.match(worker, /MAX_WORKER_BATCH = 2/u);
  assert.match(worker, /p_lease_seconds: LEASE_SECONDS/u);
  assert.match(worker, /MIN_LEASE_REMAINING_MS = 60_000/u);
  assert.match(worker, /worker_claim_lease_expiring/u);
});

test('catalog image worker validates remote images and normalizes public objects', () => {
  assert.match(worker, /fetchSafeRemoteImage/u);
  assert.match(worker, /processImageForStorage\(fetched\.bytes, \{ alwaysReencode: true \}\)/u);
  assert.match(
    worker,
    /import-\$\{claim\.row_id\}-\$\{sha256\.slice\(0, 32\)\}\.webp/u,
  );
  assert.match(worker, /writePublicMediaObject/u);
  assert.doesNotMatch(worker, /console\.(?:error|warn|info)\([^)]*source_url/u);
});

test('catalog image worker route is secret-protected and has a daily fallback', () => {
  assert.match(route, /timingSafeEqual/u);
  assert.match(route, /processCatalogImportImages\(2\)/u);
  assert.match(route, /export const POST = GET/u);
  assert.doesNotMatch(route, /headers\.get\('x-vercel-id'\)/u);
  assert.match(route, /cache-control': 'private, no-store/u);
  assert.match(maintenance, /processCatalogImportImages\(1\)/u);
  assert.doesNotMatch(maintenance, /headers\.get\('x-vercel-id'\)/u);
  assert.doesNotMatch(maintenance, /error instanceof Error \? error\.message/u);
});

test('catalog image leases terminate after five crashes and reject stale completion', () => {
  assert.match(migration, /create index catalog_import_image_lease_expiry_idx/u);
  assert.match(migration, /create index catalog_import_jobs_processing_idx/u);
  assert.match(
    migration,
    /worker_status = case when worker_attempts >= 5 then 'dead_letter' else 'retry' end/u,
  );
  assert.match(
    migration,
    /v_row\.worker_lease_expires_at is null or v_row\.worker_lease_expires_at <= now\(\)/u,
  );
  assert.match(migration, /'worker_lease_expired'/u);
  assert.match(migration, /'remote_image_product_not_found'/u);
  assert.match(
    migration,
    /with candidates as \([\s\S]{0,320}join public\.products as product on product\.store_id = job\.store_id/u,
  );
  assert.doesNotMatch(migration, /attach_my_catalog_import_image/u);
});

test('catalog image completion is immutable, idempotent and cleans replaced objects', () => {
  assert.match(
    migration,
    /'\/import-' \|\| v_row\.id::text \|\| '-' \|\| left\(p_sha256, 32\) \|\| '\.webp'/u,
  );
  assert.match(migration, /v_existing_asset\.id is not null/u);
  assert.match(migration, /'idempotent', true/u);
  assert.match(migration, /v_previous_asset\.id is not null/u);
  assert.match(migration, /'catalog_import_position_replaced'/u);
});
