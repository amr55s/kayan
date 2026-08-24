import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = new URL('../../supabase/migrations/20260818174135_marketplace_catalog_search_v2.sql', import.meta.url);

test('public catalog v2 normalizes Arabic search and exposes bounded filters', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /normalize_marketplace_arabic_search/u);
  assert.match(sql, /pg_trgm/u);
  for (const parameter of ['p_store_slug', 'p_min_price', 'p_max_price', 'p_in_stock', 'p_min_rating']) {
    assert.match(sql, new RegExp(`\\b${parameter}\\b`, 'u'));
  }
  assert.match(sql, /p_limit not between 1 and 48/u);
  assert.match(sql, /store\.name/u);
});

test('public catalog v2 uses a deterministic keyset cursor without offset pagination', async () => {
  const sql = await readFile(migration, 'utf8');
  const fn = sql.slice(sql.indexOf('create or replace function public.list_marketplace_catalog_v2'));
  assert.match(fn, /p_cursor jsonb/u);
  assert.match(fn, /next_cursor/u);
  assert.match(fn, /sort_key desc, available_key desc, rating_key desc/u);
  assert.match(fn, /created_at desc, id desc/u);
  assert.doesNotMatch(fn, /\boffset\b/iu);
  assert.doesNotMatch(fn, /is_featured/u);
});

test('catalog UI preserves every filter and does not expose page-number pagination', async () => {
  const [catalog, controls, page] = await Promise.all([
    readFile(new URL('../../components/marketplace/catalog-view.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../components/marketplace/catalog-controls.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../app/marketplace/page.tsx', import.meta.url), 'utf8'),
  ]);
  for (const field of ['min_price', 'max_price', 'stock', 'rating', 'store']) {
    assert.match(`${catalog}\n${controls}\n${page}`, new RegExp(field, 'u'));
  }
  assert.match(catalog, /nextCursor/u);
  assert.doesNotMatch(catalog, /visiblePages|pageCount/u);
});
