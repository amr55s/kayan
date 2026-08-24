import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const baseline = readFileSync(
  new URL(
    '../supabase/migrations/20260724000000_legacy_directory_baseline.sql',
    import.meta.url,
  ),
  'utf8',
);

test('the migration chain reconstructs every pre-existing legacy table', () => {
  for (const table of [
    'places',
    'drivers',
    'pending_requests',
    'feedback_requests',
  ]) {
    assert.match(
      baseline,
      new RegExp(`create table if not exists public\\.${table} \\(`),
    );
  }
});

test('the legacy baseline does not recreate historical permissive policies', () => {
  assert.doesNotMatch(baseline, /create policy|grant (?:all|insert|update|delete)/i);
});
