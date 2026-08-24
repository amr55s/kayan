import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertMagic,
  parseLegacySource,
} from '../scripts/backfill-legacy-media.mjs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260810081000_legacy_media_backfill.sql', import.meta.url),
  'utf8',
);
const script = readFileSync(new URL('../scripts/backfill-legacy-media.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('legacy backfill ledger is default-deny and exposes only service-role functions', () => {
  for (const table of [
    'legacy_media_backfill_runs',
    'legacy_media_backfill_items',
    'legacy_media_source_deletion_outbox',
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'u'));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'u'));
  }
  assert.doesNotMatch(migration, /create policy/iu);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete)[^;]*legacy_media_backfill/iu);
  assert.match(migration, /grant execute on function public\.claim_legacy_media_backfill_items[\s\S]*to service_role/iu);
  assert.match(migration, /coalesce\(\(select auth\.jwt\(\) ->> 'role'\), session_user::text\)/u);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to authenticated/iu);
});

test('leases, retry limits, resumable checkpoints and dead letters are bounded', () => {
  assert.match(migration, /p_limit not between 1 and 25/iu);
  assert.match(migration, /p_lease_seconds not between 60 and 600/iu);
  assert.match(migration, /attempts integer not null default 0 check \(attempts between 0 and 5\)/iu);
  assert.match(migration, /for update skip locked/iu);
  assert.match(migration, /place_checkpoint uuid[\s\S]*driver_checkpoint uuid/iu);
  assert.match(migration, /status in \('pending', 'leased', 'retry', 'completed', 'stale', 'dead_letter'\)/iu);
  assert.match(migration, /status in \('retry', 'dead_letter'\)[\s\S]*lease_token = p_lease_token[\s\S]*return v_item\.status/iu);
  assert.match(migration, /legacy_media_backfill\.dead_lettered/iu);
});

test('completion is an ordinal-preserving CAS and source deletion stays behind retention', () => {
  assert.match(migration, /v_images\[v_item\.image_ordinal\] = v_item\.source_url/iu);
  assert.match(migration, /v_images\[v_item\.image_ordinal\] := p_output_public_url/iu);
  assert.match(migration, /where profile_id = v_item\.entity_id and avatar_url = v_item\.source_url/iu);
  assert.match(migration, /status text not null default 'retention_hold'/iu);
  assert.match(migration, /delete_after >= verified_at \+ interval '30 days'/iu);
  assert.match(migration, /This only releases rows after verified retention\. It never deletes a source/iu);
  assert.doesNotMatch(migration, /delete from storage\.objects/iu);
});

test('DigitalOcean keys are content-addressed and contain no owner identifiers', () => {
  assert.match(script, /media\/legacy-backfill\/\$\{kind\}\/\$\{outputSha\.slice\(0, 2\)\}\/\$\{outputSha\}\.webp/u);
  assert.doesNotMatch(script, /objectKey[^\n]*(?:entity_id|profile_id|owner_id|user_id)/iu);
  assert.match(migration, /media\/legacy-backfill\/\(place\|driver\)\/\[a-f0-9\]\{2\}\/\[a-f0-9\]\{64\}/u);
});

test('CLI is dry-run by default and apply requires a literal double opt-in', () => {
  assert.match(script, /const apply = args\.includes\('--apply'\)/u);
  assert.match(script, /apply && confirmation !== APPLY_CONFIRMATION/u);
  assert.match(script, /parseIntegerFlag\('concurrency', 3, 4\)/u);
  assert.match(script, /parseIntegerFlag\('batch-size', 10, 25\)/u);
  assert.equal(packageJson.scripts['media:backfill:dry-run'], 'node scripts/backfill-legacy-media.mjs');
  assert.equal(packageJson.scripts['media:backfill:apply'], 'node scripts/backfill-legacy-media.mjs --apply');
});

test('source parser accepts only exact public legacy bucket URLs', () => {
  const origin = 'https://sample.supabase.co';
  assert.deepEqual(
    parseLegacySource(
      `${origin}/storage/v1/object/public/listing-images/folder/photo%20one.png`,
      origin,
      'listing-images',
    ),
    { bucket: 'listing-images', key: 'folder/photo one.png' },
  );
  assert.equal(parseLegacySource('https://example.com/a.png', origin, 'listing-images'), null);
  assert.equal(
    parseLegacySource(`${origin}/storage/v1/object/public/listing-images/%2e%2e/secret`, origin, 'listing-images'),
    null,
  );
  assert.equal(
    parseLegacySource(`${origin}/storage/v1/object/public/driver-avatars/a.png?token=x`, origin, 'driver-avatars'),
    null,
  );
});

test('image magic validation does not trust extensions or HTTP MIME', () => {
  assert.doesNotThrow(() => assertMagic(Buffer.from([0xff, 0xd8, 0xff, 0x00])));
  assert.doesNotThrow(() => assertMagic(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  assert.doesNotThrow(() => assertMagic(Buffer.from('RIFF0000WEBP', 'ascii')));
  assert.throws(() => assertMagic(Buffer.from('<svg></svg>')), /unsupported_image_magic/u);
});

test('runtime verifies transformed uploads and never calls a source delete API', () => {
  assert.match(script, /AbortSignal\.timeout\(15_000\)/u);
  assert.match(script, /SOURCE_MAX_BYTES = 12 \* 1024 \* 1024/u);
  assert.match(script, /\['image\/jpeg', 'image\/png', 'image\/webp'\]\.includes\(contentType\)/u);
  assert.match(script, /sharp\(source, \{ failOn: 'error', limitInputPixels: 40_000_000 \}\)/u);
  assert.match(script, /createHash\('sha256'\)/u);
  assert.match(script, /HeadObjectCommand/u);
  assert.match(script, /head\.Metadata\?\.sha256 !== sha256/u);
  assert.doesNotMatch(script, /DeleteObjectCommand|\.storage\.from\([^)]*\)\.remove/iu);
  assert.doesNotMatch(script, /sourceUrl[,)\]}]*[\s\S]{0,40}(?:console|writeReport)/u);
});
