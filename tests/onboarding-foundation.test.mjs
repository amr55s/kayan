import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
function load(relative, dependencies = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const loadedModule = { exports: {} };
  Function('require', 'module', 'exports', compiled)(
    (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : nativeRequire(name), loadedModule, loadedModule.exports,
  );
  return loadedModule.exports;
}
const types = load('../lib/onboarding/types.ts');
const schemas = load('../lib/onboarding/validation.ts', { './types': types });
const validId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const draft = { id: validId, userId, activityKind: 'store', step: 1, version: 1,
  status: 'draft', data: {}, updatedAt: '2026-08-30T12:00:00Z' };
const base = { activityKind: 'store', step: 1, data: {}, expectedVersion: 0 };

test('all five activities can save incomplete optional content without claiming approval', () => {
  for (const activityKind of types.ACTIVITY_KINDS) {
    assert.equal(schemas.saveOnboardingDraftSchema.parse({ ...base, activityKind }).activityKind, activityKind);
  }
  assert.equal(schemas.saveOnboardingDraftSchema.safeParse({ ...base, data: { role: 'admin' } }).success, false);
  assert.equal(schemas.saveOnboardingDraftSchema.safeParse({ ...base, status: 'approved' }).success, false);
  assert.equal(schemas.saveOnboardingDraftSchema.safeParse({ ...base, userId }).success, false);
});

test('drafts allow partial product input and prevent unbounded, duplicate and URL media payloads', () => {
  assert.equal(schemas.onboardingDraftDataSchema.safeParse({ product: { name: '', description: '', priceEgp: '' } }).success, true);
  for (const data of [{ mediaIds: [validId, validId] }, { mediaIds: ['https://example.com/a.jpg'] },
    { description: 'x'.repeat(5001) }, { product: { name: '', description: '', priceEgp: '', status: 'published' } }]) {
    assert.equal(schemas.onboardingDraftDataSchema.safeParse(data).success, false);
  }
});

test('invalid step/version/identity parameters fail before any RPC', async () => {
  let calls = 0;
  const repository = load('../lib/onboarding/repository.ts', {
    'server-only': {}, './validation': schemas,
    '@/lib/supabase/server': { createClient: async () => ({ rpc: async () => { calls++; return { data: draft, error: null }; } }) },
  });
  for (const invalid of [{ ...base, expectedVersion: -1 }, { ...base, step: 9 }, { ...base, draftId: 'wrong' }]) {
    await assert.rejects(repository.saveMyOnboardingDraft(invalid));
  }
  assert.equal(calls, 0);
});

test('repository passes expected version and authenticated RPC only; conflicts stay distinguishable', async () => {
  const calls = [];
  let error = null;
  const repository = load('../lib/onboarding/repository.ts', {
    'server-only': {}, './validation': schemas,
    '@/lib/supabase/server': { createClient: async () => ({ rpc: async (...args) => {
      calls.push(args); return { data: draft, error };
    } }) },
  });
  assert.deepEqual(await repository.saveMyOnboardingDraft(base), draft);
  assert.deepEqual(calls[0], ['save_my_onboarding_draft', {
    p_activity_kind: 'store', p_step: 1, p_data: {}, p_expected_version: 0,
  }]);
  await repository.saveMyOnboardingDraft({ ...base, draftId: validId, expectedVersion: 1 });
  assert.equal(calls[1][1].p_draft_id, validId);
  assert.equal(calls[1][1].p_expected_version, 1);
  error = { code: '40001', message: 'onboarding_version_conflict' };
  await assert.rejects(repository.saveMyOnboardingDraft(base), repository.OnboardingConflictError);
});

test('migration isolates new drafts and approvals without modifying legacy profile roles', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260830123358_activity_memberships_onboarding_drafts.sql', import.meta.url), 'utf8');
  assert.match(sql, /unique\(auth_user_id,activity_kind\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /v_draft\.version<>p_expected_version/);
  assert.match(sql, /a\.owner_id=v_uid and a\.draft_id=v_draft\.id/);
  assert.match(sql, /auth\.identities i where i\.user_id=v_uid and i\.provider='google'/);
  assert.doesNotMatch(sql, /update public\.profiles|delete from auth\.users|set role\s*=/i);
  assert.match(sql, /object_key like 'onboarding\//);
  assert.match(sql, /asset_id uuid not null unique references public\.onboarding_media_assets\(id\) on delete restrict/);
});
