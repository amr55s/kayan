import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260830082401_add_real_estate_listing_subtype.sql');
const releaseMarker = read('supabase/migrations/20260830115034_real_estate_release_marker.sql');
const actions = read('lib/operations/actions.ts');
const validation = read('lib/operations/validation.ts');
const queries = read('lib/supabase/queries.ts');

test('real-estate requests accept only bounded, typed data and opaque owned media', () => {
  assert.match(validation, /realEstateDetailsSchema/);
  assert.match(validation, /wholeNumber\(1, 999_999_999/);
  assert.match(validation, /عدد الغرف مطلوب/);
  assert.match(actions, /imageUrls\.length < 5 \|\| imageUrls\.length > 7/);
  assert.match(actions, /parseLegacyUploadToken/);
  assert.match(actions, /\.eq\('owner_id', authUserId\)/);
  assert.match(actions, /\.eq\('status', 'ready'\)/);
  assert.match(actions, /real_estate_details/);
});

test('approval is atomic and the subtype is private except for approved public reads', () => {
  assert.match(migration, /begin;[\s\S]*commit;\s*$/u);
  assert.match(migration, /create table if not exists public\.place_real_estate/u);
  assert.match(migration, /alter table public\.place_real_estate enable row level security/u);
  assert.match(migration, /revoke all on table public\.place_real_estate from public, anon, authenticated/u);
  assert.match(migration, /grant select on table public\.place_real_estate to anon, authenticated/u);
  assert.match(migration, /public read published real estate details/u);
  assert.match(migration, /create or replace function public\.approve_account_request/u);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/u);
  assert.match(migration, /for update/u);
  assert.match(migration, /upload\.owner_id = v_request\.auth_user_id/u);
  assert.match(migration, /update public\.legacy_media_uploads[\s\S]*status = 'claimed'/u);
  assert.match(migration, /insert into public\.place_real_estate/u);
  assert.match(migration, /revoke all on function public\.approve_account_request\(uuid\) from public, anon, authenticated/u);
  assert.match(migration, /grant execute on function public\.approve_account_request\(uuid\) to authenticated/u);
});

test('real-estate reads degrade gracefully before the additive migration and readiness requires its marker', () => {
  assert.match(queries, /place_real_estate\(\*\)/u);
  assert.match(queries, /if \(result\.error\)[\s\S]*\.select\('\*'\)/u);
  assert.match(releaseMarker, /'version', '20260830115034'/u);
  assert.match(releaseMarker, /reviewed_real_estate_listings/u);
  assert.match(read('app/api/health/ready/route.ts'), /EXPECTED_SCHEMA_VERSION = '20260830115034'/u);
});
