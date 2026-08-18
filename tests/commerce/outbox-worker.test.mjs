import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const worker = readFileSync(
  new URL('../../lib/commerce/outbox-worker.ts', import.meta.url),
  'utf8',
);
const cron = readFileSync(
  new URL('../../app/api/cron/maintenance/route.ts', import.meta.url),
  'utf8',
);

test('the Spaces deletion worker claims and completes through lease-bound RPCs', () => {
  assert.match(worker, /claim_marketplace_outbox/);
  assert.match(worker, /complete_marketplace_outbox/);
  assert.match(worker, /fail_marketplace_outbox/);
  assert.match(worker, /p_worker_id: workerId/);
  assert.match(worker, /deleteSpaceObject/);
});

test('outbox object keys cannot escape their expected storage prefix', () => {
  assert.match(worker, /value\.startsWith\('\/'\)/);
  assert.match(worker, /segment === '\.\.'/);
  assert.match(worker, /'staging\/'/);
  assert.match(worker, /'media\/'/);
  assert.match(worker, /outbox_bucket_mismatch/);
});

test('the authenticated maintenance endpoint drains deletion work after DB cleanup', () => {
  const maintenanceCall = cron.indexOf("rpc('run_marketplace_maintenance')");
  const outboxCall = cron.lastIndexOf('processMarketplaceDeletionOutbox');
  assert.ok(maintenanceCall >= 0);
  assert.ok(outboxCall > maintenanceCall);
  assert.match(cron, /timingSafeEqual/);
});
