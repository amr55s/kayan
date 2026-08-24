import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260810080000_move_active_legacy_media_to_spaces.sql');
const prepare = read('lib/supabase/actions.ts');
const imageClient = read('lib/images/client.ts');
const finalize = read('app/api/legacy-media/uploads/[id]/finalize/route.ts');
const operations = read('lib/operations/actions.ts');
const adminActions = read('lib/supabase/admin-actions.ts');

test('active legacy uploads no longer write to Supabase Storage', () => {
  for (const source of [prepare, imageClient, operations, adminActions]) {
    assert.doesNotMatch(source, /\.storage\s*\.|\.from\(['"](?:listing-images|driver-avatars)['"]\)/u);
  }
  assert.match(prepare, /createPrivateStageUpload/u);
  assert.match(imageClient, /method: 'PUT'/u);
  assert.match(operations, /writePrivateMediaObject/u);
  assert.match(operations, /writePublicMediaObject/u);
});

test('place uploads are private staged, verified and normalized before an owned token is returned', () => {
  assert.match(imageClient, /crypto\.subtle\.digest\('SHA-256'/u);
  assert.match(finalize, /headPrivateMediaObject/u);
  assert.match(finalize, /metadataHash !== row\.expected_sha256/u);
  assert.match(finalize, /sourceHash !== row\.expected_sha256/u);
  assert.match(finalize, /alwaysReencode: true/u);
  assert.match(finalize, /contentType: processed\.contentType/u);
  assert.match(finalize, /legacyUploadToken\(row\.id\)/u);
  assert.doesNotMatch(finalize, /publicUrl.*request|objectKey.*request/iu);
});

test('database contract binds uploads to the authenticated place or driver and keeps tables server-only', () => {
  assert.match(migration, /alter table public\.legacy_media_uploads enable row level security/iu);
  assert.match(migration, /revoke all on table public\.legacy_media_uploads from public, anon, authenticated/iu);
  assert.match(migration, /grant select, insert, update, delete on table public\.legacy_media_uploads to service_role/iu);
  assert.match(migration, /upload\.owner_id = v_uid/iu);
  assert.match(migration, /branch\.place_id = p_place_id/iu);
  assert.match(migration, /profile\.role = 'driver'/iu);
  assert.match(migration, /update public\.places[\s\S]*set images = array/iu);
  assert.match(migration, /update public\.driver_profiles[\s\S]*avatar_url = v_upload\.public_url/iu);
});

test('cleanup uses the durable marketplace outbox for staging, orphans and replaced avatars', () => {
  assert.match(migration, /media\.staging_delete_requested/iu);
  assert.match(migration, /media\.delete_requested/iu);
  assert.match(migration, /for update skip locked/iu);
  assert.match(finalize, /enqueueMediaDeletion/iu);
  assert.match(operations, /legacy\.avatar\.media\.failed/iu);
});

test('public legacy media keys never disclose the owning Auth user id', () => {
  assert.match(finalize, /media\/legacy\/place\/pending\/\$\{assetId\}\.webp/u);
  assert.doesNotMatch(finalize, /media\/legacy\/place[^`]*\$\{profile\.id\}/u);
  assert.match(operations, /media\/legacy\/driver-avatar\/\$\{uploadId\}\.webp/u);
  assert.doesNotMatch(operations, /media\/legacy\/driver-avatar[^`]*\$\{profile\.id\}/u);
  assert.doesNotMatch(migration, /media\/legacy\/place\/pending\/'\s*\|\|\s*v_row\.owner_id/u);
});

test('active admin and merchant callers claim opaque uploads before storing CDN URLs', () => {
  assert.match(operations, /splitLegacyPlaceImageReferences\(newImageUrls, 6\)/u);
  assert.match(operations, /claimLegacyPlaceUploads\([\s\S]*pendingImages\.uploadIds,[\s\S]*data\.placeId,[\s\S]*existingImages/u);
  assert.match(adminActions, /splitLegacyPlaceImageReferences\(placeData\.images \?\? \[\], 6\)/u);
  assert.match(adminActions, /claimLegacyPlaceUploads\(pendingImages\.uploadIds, inserted\.id, \[\]\)/u);
  assert.match(adminActions, /splitLegacyPlaceImageReferences\(updatedData\.images \?\? \[\], 15\)/u);
});
