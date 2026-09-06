import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260818175652_add_reversible_marketplace_media_deletions.sql');

test('media deletion undo is actor-bound, expiring, and delays physical deletion', () => {
  assert.match(migration, /create table public\.marketplace_media_deletion_intents/u);
  assert.match(migration, /actor_user_id uuid not null references auth\.users/u);
  assert.match(migration, /v_expires_at timestamptz := now\(\) \+ interval '10 minutes'/u);
  assert.match(migration, /set available_at = greatest\(available_at, v_expires_at\)/u);
  assert.match(migration, /where id = p_undo_id and actor_user_id = v_actor/u);
  assert.match(migration, /and intent\.expires_at > now\(\)/u);
  assert.match(migration, /delete from public\.marketplace_outbox[\s\S]*locked_at is null/u);
  assert.doesNotMatch(migration, /grant .*marketplace_media_deletion_intents.*authenticated/iu);
});

test('undo refuses stale snapshots and restores both draft and moderated workflows', () => {
  assert.match(migration, /media_undo_version_conflict/u);
  assert.match(migration, /after_snapshot_sha256/u);
  assert.match(migration, /perform public\.stage_product_revision/u);
  assert.match(migration, /perform public\.stage_store_revision/u);
  assert.match(migration, /set status = 'active', deleted_at = null/u);
  assert.match(migration, /product_revisions_guard_media_undo/u);
  assert.match(migration, /store_revisions_guard_media_undo/u);
});

test('store settings exposes bounded logo, cover, gallery upload and accessible reorder', () => {
  const manager = read('components/marketplace/store-image-manager.tsx');
  const setup = read('lib/commerce/operational-setup.ts');
  assert.match(manager, /MAX_STORE_IMAGES = 15/u);
  assert.match(manager, /purpose: 'store'/u);
  assert.match(manager, /value="logo"/u);
  assert.match(manager, /value="cover"/u);
  assert.match(manager, /value="gallery"/u);
  assert.match(manager, /onDragStart/u);
  assert.match(manager, /event\.altKey/u);
  assert.match(manager, /failedUpload/u);
  assert.match(manager, /name="undoId"/u);
  assert.match(setup, /get_my_marketplace_store_media/u);
  assert.match(setup, /list_my_marketplace_media_deletion_intents/u);
});

test('product gallery offers durable undo and does not invite unsupported HEIC files', () => {
  const gallery = read('components/marketplace/merchant/product-gallery-manager.tsx');
  const client = read('lib/media/client.ts');
  assert.match(gallery, /pendingDeletions/u);
  assert.match(gallery, /undoDeleteImageAction/u);
  assert.match(gallery, /event\.altKey/u);
  assert.doesNotMatch(gallery, /\.heic|\.heif/iu);
  assert.match(client, /finalizeUploadSession/u);
  assert.match(client, /upload_session_busy/u);
  assert.match(client, /attempt < 3/u);
});
