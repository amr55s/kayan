import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isMissingDatabaseRoutine } from '../lib/supabase/missing-routine.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('missing PostgREST routines are detected without treating other failures as absent schema', () => {
  assert.equal(isMissingDatabaseRoutine({ code: 'PGRST202' }), true);
  assert.equal(isMissingDatabaseRoutine({ code: '42883' }), true);
  assert.equal(isMissingDatabaseRoutine({ message: 'Could not find the function public.list_marketplace_catalog_v2' }), true);
  assert.equal(isMissingDatabaseRoutine({ code: '42501', message: 'permission denied' }), false);
  assert.equal(isMissingDatabaseRoutine(null), false);
});

test('marketplace catalog and Google customer setup skip a missing live schema instead of crashing', () => {
  const catalog = read('lib/commerce/catalog.ts');
  const ensure = read('lib/commerce/ensure-customer.ts');
  const callback = read('app/auth/callback/route.ts');
  const recovery = read('lib/auth/profile-recovery-action.ts');
  assert.match(catalog, /isMissingDatabaseRoutine\(error\)/);
  assert.match(catalog, /emptyCatalog\(\)/);
  assert.match(ensure, /ensure_marketplace_customer/);
  assert.match(ensure, /isMissingDatabaseRoutine\(error\)/);
  assert.match(callback, /ensureMarketplaceCustomerProfile/);
  assert.match(recovery, /ensureMarketplaceCustomerProfile/);
  const onboarding = read('lib/onboarding/repository.ts');
  assert.match(onboarding, /isMissingDatabaseRoutine\(result\.error\)/);
  assert.match(onboarding, /return \[\];/);
});
