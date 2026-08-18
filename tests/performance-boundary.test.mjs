import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('CI enforces compressed production bundle budgets after a Turbopack build', () => {
  const packageJson = JSON.parse(read('package.json'));
  const workflow = read('.github/workflows/quality.yml');
  const script = read('scripts/check-bundle-budget.mjs');

  assert.equal(packageJson.scripts['check:bundle'], 'node scripts/check-bundle-budget.mjs');
  assert.match(workflow, /npm run build[\s\S]*npm run check:bundle/);
  assert.match(script, /rootMainGzipBytes:\s*250 \* 1024/);
  assert.match(script, /largestRootChunkGzipBytes:\s*150 \* 1024/);
  assert.match(script, /allCssGzipBytes:\s*90 \* 1024/);
  assert.match(script, /gzipSync\(bytes, \{ level: 9 \}\)/);
});

test('the service worker never page-caches private or commerce state', () => {
  const worker = read('public/sw.js');
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /isNextDataRequest\(request, url\)/);
  assert.doesNotMatch(worker, /PUBLIC_PAGES[^;]*(?:marketplace|cart|checkout|orders|signin|auth)/s);
  assert.match(worker, /event\.respondWith\(fetch\(request\)\)/);
});

test('the active root loading state stays flat without decorative gradients', () => {
  const loading = read('app/loading.tsx');
  assert.doesNotMatch(loading, /(?:linear|radial|conic)-gradient|bg-gradient|from-[^\s"']+\s+via-/u);
  assert.match(loading, /border-y[\s\S]*bg-zinc-50/u);
});

test('active driver avatars stay flat and dead legacy UI does not enter Tailwind output', () => {
  const avatar = read('lib/driver-avatar.ts');
  const css = read('app/globals.css');
  assert.doesNotMatch(avatar, /bg-gradient|from-|to-/u);
  assert.doesNotMatch(css, /components\/(?:directory|delivery|modals|ui\/heroui-compat)/u);
});
