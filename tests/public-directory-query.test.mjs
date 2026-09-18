import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('public homepage reads use the anon client and keep coupons when real estate is absent', () => {
  const queries = read('lib/supabase/queries.ts');
  assert.match(queries, /createPublicClient\(\)/);
  assert.doesNotMatch(queries, /createAdminClient/);
  assert.match(queries, /PUBLIC_PLACE_COLUMNS/);
  assert.match(queries, /store_coupons\(\*\), place_real_estate\(\*\)/);
  assert.match(queries, /store_coupons\(\*\)/);
  assert.doesNotMatch(queries, /\.select\('\*'\)/);
  assert.match(queries, /recommend_count/);
});

test('public drivers prefer contact-free RPCs and fall back to the published drivers table', () => {
  const queries = read('lib/supabase/queries.ts');
  assert.match(queries, /rpc\('list_public_legacy_drivers'\)/);
  assert.match(queries, /rpc\('list_public_registered_drivers'\)/);
  assert.match(queries, /\.from\('drivers'\)/);
  assert.match(queries, /select\('id, name, vehicle_type, is_active, active_until, created_at'\)/);
  assert.doesNotMatch(queries, /from\('drivers'\)[\s\S]*phone, whatsapp/);
  assert.match(queries, /return \[\];/);
  assert.doesNotMatch(queries, /public_legacy_drivers_query_failed/);
  assert.match(queries, /maskPublicDriverContacts/);
  assert.match(queries, /phone: ''/);
  assert.match(queries, /whatsapp: null/);
  assert.match(queries, /return \[\];/);
});
