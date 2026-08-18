import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the ambiguous legacy health endpoint is removed', () => {
  assert.equal(existsSync(new URL('../app/api/health/route.ts', import.meta.url)), false);
});

test('liveness is dependency-free and cannot be cached', () => {
  const source = read('app/api/health/live/route.ts');
  assert.match(source, /status:\s*'ok'/);
  assert.match(source, /Cache-Control['"]?:\s*'no-store, max-age=0'/);
  assert.doesNotMatch(source, /createAdminClient|S3Client|fetch\(/);
});

test('readiness probes database, exact schema marker, Spaces, and worker configuration with bounded waits', () => {
  const source = read('app/api/health/ready/route.ts');
  assert.match(source, /EXPECTED_SCHEMA_VERSION\s*=\s*'\d{14}'/);
  assert.match(source, /marketplace_runtime_settings/);
  assert.match(source, /key:\s*'eq\.schema_version'/);
  assert.match(source, /HeadBucketCommand/);
  assert.match(source, /marketplace_release_ready/);
  assert.doesNotMatch(source, /rpc\/catalog_image_worker_configured/);
  assert.ok((source.match(/AbortSignal\.timeout\(CHECK_TIMEOUT_MS\)/g) || []).length >= 4);
  assert.match(source, /status:\s*snapshot\.ready\s*\?\s*200\s*:\s*503/);
  assert.match(source, /Cache-Control['"]?:\s*'no-store, max-age=0'/);
});

test('the final release marker fails closed on late security capabilities and all hosted workers', () => {
  const migration = read('supabase/migrations/20260818192209_marketplace_release_marker.sql');
  assert.match(migration, /'version',\s*'20260818192209'/);
  assert.match(migration, /marketplace_admin_memberships/);
  assert.match(migration, /marketplace_return_requests/);
  assert.match(migration, /store_branches/);
  assert.match(migration, /marketplace_media_deletion_intents/);
  assert.match(migration, /dairtak-marketplace-db-maintenance/);
  assert.match(migration, /dairtak-catalog-image-worker/);
  assert.match(migration, /dairtak-marketplace-push-worker/);
  assert.match(migration, /return public\.catalog_image_worker_configured\(\)/);
  assert.match(migration, /when others then\s*return false/);
  assert.match(migration, /revoke all on function public\.marketplace_release_ready\(\)[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.marketplace_release_ready\(\) to service_role/);
});

test('readiness deduplicates concurrent probes and briefly memoizes safe status only', () => {
  const source = read('app/api/health/ready/route.ts');
  assert.match(source, /READY_CACHE_MS\s*=\s*30_000/);
  assert.match(source, /NOT_READY_CACHE_MS\s*=\s*5_000/);
  assert.match(source, /pendingProbe\s*\?\?\s*runProbes\(\)/);
  assert.match(source, /cachedSnapshot\.expiresAt\s*>\s*Date\.now\(\)/);
  assert.doesNotMatch(source, /cachedSnapshot[^;]*(?:secret|accessKey|bucket|endpoint)/i);
});

test('public health responses never serialize infrastructure secrets or failure details', () => {
  const source = read('app/api/health/ready/route.ts');
  const responseBody = source.slice(source.lastIndexOf('return Response.json('));
  assert.doesNotMatch(responseBody, /secret|accessKey|bucket|endpoint|reason|error|message/i);
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
});
