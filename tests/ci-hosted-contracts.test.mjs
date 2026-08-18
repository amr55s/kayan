import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const workflow = read('.github/workflows/hosted-contracts.yml');
const spaces = read('scripts/smoke-do-spaces-prefix.mjs');
const targetGuard = read('scripts/validate-supabase-ci-target.mjs');
const rls = read('supabase/tests/rls_contract.sql');
const e2e = read('e2e/public-preview.spec.ts');
const packageJson = JSON.parse(read('package.json'));

test('hosted jobs are conditional and missing secrets are reported as skipped', () => {
  assert.match(workflow, /Hosted contract availability/u);
  assert.match(workflow, /SKIPPED — required secrets unavailable/u);
  assert.match(workflow, /if: needs\.contract-availability\.outputs\.supabase == 'true'/u);
  assert.match(workflow, /if: needs\.contract-availability\.outputs\.spaces == 'true'/u);
});

test('Supabase CI refuses production and checks migrations, RLS, and generated types', () => {
  assert.match(targetGuard, /branchRef === productionRef/u);
  assert.match(targetGuard, /ALLOW_DISPOSABLE_BRANCH_MIGRATIONS/u);
  assert.match(workflow, /supabase db push[\s\S]*supabase test db[\s\S]*supabase gen types typescript[\s\S]*diff --unified/u);
  assert.match(rls, /relation\.relrowsecurity/u);
  assert.match(rls, /SECURITY DEFINER routines pin a trusted search_path/u);
});

test('Spaces smoke cleanup is confined to its unique exact prefix', () => {
  assert.match(spaces, /ci-smoke\/\$\{runId\}\/\$\{randomUUID\(\)\}\//u);
  assert.match(spaces, /createdKeys = new Set/u);
  assert.match(spaces, /if \(!createdKey\.startsWith\(prefix\)\)/u);
  assert.doesNotMatch(spaces, /DeleteObjectsCommand|ListBucketsCommand/u);
});

test('Vercel preview gates pin browser dependencies and run Playwright, axe, and Lighthouse', () => {
  assert.equal(packageJson.devDependencies['@playwright/test'], '1.62.1');
  assert.equal(packageJson.devDependencies['@axe-core/playwright'], '4.13.0');
  assert.match(workflow, /deployment_status/u);
  assert.match(workflow, /\.vercel\\\.app/u);
  assert.match(workflow, /npm run test:e2e:preview/u);
  assert.match(workflow, /treosh\/lighthouse-ci-action@512cc908a55bfb0ad231facca52adf3d3a651df4/u);
  assert.match(e2e, /AxeBuilder/u);
  assert.match(e2e, /Google sign-in/u);
});
