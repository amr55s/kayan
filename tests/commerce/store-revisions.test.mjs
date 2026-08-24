import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL(
  '../../supabase/migrations/20260810083000_store_sensitive_revisions.sql',
  import.meta.url,
), 'utf8');
const setupAdapter = readFileSync(new URL('../../lib/commerce/operational-setup.ts', import.meta.url), 'utf8');
const settingsPanel = readFileSync(new URL(
  '../../components/marketplace/operational-setup-panels.tsx',
  import.meta.url,
), 'utf8');
const finalizeRoute = readFileSync(new URL(
  '../../app/api/media/uploads/[id]/finalize/route.ts',
  import.meta.url,
), 'utf8');

test('published store changes use complete immutable revisions', () => {
  assert.match(migration, /create table public\.store_revisions/u);
  assert.match(migration, /create unique index store_revisions_one_pending_idx/u);
  assert.match(migration, /store_revision_snapshot_is_immutable/u);
  assert.match(migration, /store_revisions_are_immutable/u);
  assert.match(migration, /published_store_sensitive_changes_require_revision/u);
  assert.match(migration, /published_store_images_require_revision/u);
  assert.match(migration, /public\.stage_store_revision/u);
  assert.match(migration, /public\.store_sensitive_snapshot/u);
  assert.match(migration, /public\.store_live_image_snapshot/u);
});

test('store revision staging is optimistic, idempotent and safely supersedes staged assets', () => {
  assert.match(migration, /v_before\.updated_at <> p_expected_updated_at/u);
  assert.match(migration, /store_revision_idempotency_conflict/u);
  assert.match(migration, /superseded_by_newer_revision/u);
  assert.match(migration, /superseded_store_revision/u);
  assert.match(migration, /on conflict \(event_key\) do nothing/u);
  assert.match(migration, /jsonb_array_length\(v_images\) > 15/u);
  assert.match(migration, /count\(distinct item\.value ->> 'asset_id'\)/u);
});

test('published store upload reorder and delete paths stage instead of mutating live media', () => {
  assert.match(migration, /v_store\.status = 'published'/u);
  assert.match(migration, /'store-media-reorder:'/u);
  assert.match(migration, /'store-media-delete:'/u);
  assert.match(migration, /'media-finalize:' \|\| v_session\.id::text/u);
  assert.match(migration, /'pending_revision', true/u);
  assert.match(finalizeRoute, /\.from\('store_revisions'\)/u);
});

test('moderation applies atomically and cleanup covers approve and reject', () => {
  assert.match(migration, /create table public\.store_revision_apply_context/u);
  assert.match(migration, /create or replace function public\.moderate_store_revision/u);
  assert.match(migration, /store_revision_base_conflict/u);
  assert.match(migration, /approved_store_revision/u);
  assert.match(migration, /rejected_store_revision/u);
  assert.match(migration, /'store\.revision_approved'/u);
  assert.match(migration, /'store\.revision_rejected'/u);
  assert.match(migration, /'pending_revision', revision\.created_at/u);
});

test('revision rows are RLS protected and exposed read-only to authorized staff', () => {
  assert.match(migration, /alter table public\.store_revisions enable row level security/u);
  assert.match(migration, /using \(public\.can_catalog_store\(store_id\) or public\.is_marketplace_admin\(\)\)/u);
  assert.match(migration, /revoke all on table public\.store_revisions, public\.store_revision_apply_context/u);
  assert.match(migration, /grant select on table public\.store_revisions to authenticated, service_role/u);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all).*store_revisions.*authenticated/iu);
});

test('merchant settings makes pending store moderation explicit', () => {
  assert.match(setupAdapter, /pending_revision/u);
  assert.match(setupAdapter, /image_count/u);
  assert.match(settingsPanel, /selected\.pending_revision/u);
  assert.match(settingsPanel, /النسخة المنشورة الحالية/u);
});
