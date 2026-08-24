import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const prepare = readFileSync(
  new URL('../../app/api/media/uploads/route.ts', import.meta.url),
  'utf8',
);
const finalize = readFileSync(
  new URL('../../app/api/media/uploads/[id]/finalize/route.ts', import.meta.url),
  'utf8',
);
const privateView = readFileSync(
  new URL('../../app/api/media/assets/[id]/view/route.ts', import.meta.url),
  'utf8',
);

test('private object-storage staging uses the canonical commerce media contract', () => {
  for (const field of [
    'owner_id',
    'store_id',
    'entity_type',
    'entity_id',
    'staging_key',
    'expected_content_type',
    'expected_size_bytes',
    'expected_sha256',
  ]) {
    assert.match(prepare, new RegExp(`${field}:`));
  }
  assert.doesNotMatch(prepare, /owner_user_id|expected_mime_type|expected_checksum_sha256/);
});

test('media finalization is deterministic and preserves ambiguous committed objects', () => {
  assert.match(finalize, /const assetId = session\.id/);
  assert.match(finalize, /const idempotencyKey = `media-finalize:\$\{session\.id\}`/);
  assert.match(finalize, /reconciled\?\.status === 'ready'/);
  assert.match(finalize, /media_finalize_state_ambiguous/);
  assert.doesNotMatch(finalize, /randomUUID\(\).*asset/i);
});

test('the finalized asset uses server-derived identity and normalized WebP metadata', () => {
  assert.match(finalize, /alwaysReencode: true/);
  assert.match(finalize, /p_content_type: processed\.contentType/);
  assert.match(finalize, /p_byte_size: processed\.buffer\.byteLength/);
  assert.match(finalize, /p_sha256: processedChecksum/);
  assert.match(finalize, /media\/\$\{session\.merchant_id\}\/\$\{session\.entity_type\}/);
});

test('delivery proof uploads derive tenancy and authorization from the order', () => {
  const auth = readFileSync(
    new URL('../../lib/commerce/auth.ts', import.meta.url),
    'utf8',
  );
  const contracts = readFileSync(
    new URL('../../lib/media/contracts.ts', import.meta.url),
    'utf8',
  );
  assert.match(contracts, /'delivery_proof'/u);
  assert.match(prepare, /requireDeliveryProofAccess\(input\.entityId\)/u);
  assert.match(prepare, /const merchantId = access\.merchantId/u);
  assert.match(prepare, /create_my_delivery_proof_upload_session/u);
  assert.match(finalize, /requireDeliveryProofAccess\(session\.entity_id\)/u);
  assert.match(finalize, /writePrivateMediaObject/u);
  assert.match(finalize, /isPublic \? getPublicMediaUrl\(finalObjectKey\) : null/u);
  assert.match(auth, /assignment\?\.driver_id === user\.id/u);
  assert.match(auth, /order\.status !== 'out_for_delivery'/u);
  assert.match(auth, /can_fulfill_store/u);
  assert.match(privateView, /authorize_my_private_marketplace_media/u);
  assert.match(privateView, /get_private_marketplace_media_locator/u);
  assert.match(privateView, /createPrivateMediaDownload\(locator\.object_key, 60\)/u);
  assert.doesNotMatch(privateView, /\.from\('media_assets'\)/u);
});
