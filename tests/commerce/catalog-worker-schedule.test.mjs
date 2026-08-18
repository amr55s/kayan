import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  new URL('../../supabase/migrations/20260810078500_schedule_catalog_image_worker.sql', import.meta.url),
  'utf8',
);

test('hosted worker schedule reads endpoint credentials only from Vault', () => {
  assert.match(sql, /create extension if not exists pg_net/u);
  assert.match(sql, /vault\.decrypted_secrets/u);
  assert.match(sql, /dairtak_worker_base_url/u);
  assert.match(sql, /dairtak_worker_cron_secret/u);
  assert.doesNotMatch(sql, /https:\/\/[a-z0-9-]+\.vercel\.app/iu);
  assert.doesNotMatch(sql, /Bearer [A-Za-z0-9_-]{20,}/u);
});

test('hosted worker schedule is bounded, protected, and safe before provisioning', () => {
  assert.match(sql, /return null;/u);
  assert.match(sql, /\/api\/cron\/import-images/u);
  assert.match(sql, /timeout_milliseconds => 55000/u);
  assert.match(sql, /'30 seconds'/u);
  assert.match(sql, /revoke all on function public\.invoke_catalog_image_worker\(\)/u);
  assert.match(sql, /grant execute on function public\.invoke_catalog_image_worker\(\) to service_role/u);
});

test('readiness can verify worker Vault configuration without exposing it publicly', () => {
  assert.match(sql, /create or replace function public\.catalog_image_worker_configured\(\)/iu);
  assert.match(sql, /from vault\.decrypted_secrets/iu);
  assert.match(sql, /revoke all on function public\.catalog_image_worker_configured\(\)\s+from public, anon, authenticated/iu);
  assert.match(sql, /grant execute on function public\.catalog_image_worker_configured\(\) to service_role/iu);
});
