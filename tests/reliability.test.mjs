import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('driver availability hydrates from a server-provided timestamp', () => {
  const driverCard = read('components/delivery/DriverCard.tsx');
  const page = read('app/page.tsx');
  assert.match(driverCard, /useState\(renderedAt\)/);
  assert.doesNotMatch(driverCard, /useState\(\(\) => Date\.now\(\)\)/);
  assert.match(page, /renderedAt/);
});

test('place details are deep-linked without creating a fragile dynamic route', () => {
  const directory = read('components/directory/DirectoryView.tsx');
  assert.match(directory, /params\.set\('place', placeId\)/);
  assert.match(directory, /البطاقة المطلوبة غير موجودة/);
  assert.match(directory, /router\.replace\(removePlaceFromUrl\(\)/);
  assert.match(directory, /DIRECT_DETAIL_STATE/);
  assert.match(directory, /History\.prototype\.replaceState\.call/);
  assert.match(directory, /History\.prototype\.pushState\.call/);
  assert.match(directory, /currentState\[DIRECT_DETAIL_STATE\]/);
  assert.match(
    directory,
    /function closeDetails[\s\S]*window\.history\.replaceState\(window\.history\.state, '', cleanUrl\)[\s\S]*router\.replace\(cleanUrl, \{ scroll: false \}\)/,
  );
  assert.doesNotMatch(directory, /function closeDetails[\s\S]{0,500}router\.back\(\)/);
});

test('native place sharing includes the direct URL only once', () => {
  const share = read('lib/share.ts');
  assert.match(share, /const text = `\$\{title\}\\n\$\{phone\}\\nعبر كيان سيتي سبوت`/);
  assert.match(share, /navigator\.share\(\{ title: .* text, url \}\)/);
  assert.match(share, /fallbackWhatsApp\(`\$\{text\}\\n\$\{url\}`\)/);
});

test('verified merchants update their linked place directly while public suggestions stay moderated', () => {
  const operations = read('lib/operations/actions.ts');
  const publicActions = read('lib/supabase/actions.ts');
  assert.match(operations, /action: 'merchant_place_updated'/);
  assert.match(operations, /\.from\('places'\)[\s\S]*whatsapp_group_url/);
  assert.doesNotMatch(operations, /merchant_change_request_created/);
  assert.match(publicActions, /feedback_type: feedbackType/);
  assert.match(publicActions, /status: 'pending'/);
});

test('restricted browser storage cannot crash common public components', () => {
  for (const file of [
    'components/layout/PwaInstaller.tsx',
    'components/directory/UpvoteButton.tsx',
    'hooks/useFavorites.ts',
  ]) {
    const source = read(file);
    assert.match(source, /try\s*\{/);
    assert.match(source, /localStorage/);
    assert.match(source, /catch\s*\{/);
  }
});

test('analytics, speed insights, and anonymous diagnostics are mounted once', () => {
  const layout = read('app/layout.tsx');
  assert.match(layout, /<Analytics \/>/);
  assert.match(layout, /<SpeedInsights \/>/);
  assert.match(layout, /<ClientErrorReporter release=\{release\} \/>/);
});

test('auth proxy does not run on the cached public directory', () => {
  const proxy = read('proxy.ts');
  assert.ok(proxy.includes("'/admin/:path*'"));
  assert.ok(proxy.includes("'/merchant/:path*'"));
  assert.ok(!proxy.includes("matcher: ['/']"));
});

test('database migration keeps diagnostics private and storage writes server-only', () => {
  const migration = read(
    'supabase/migrations/202607280001_place_details_reliability.sql',
  );
  const postDeploy = read(
    'supabase/migrations/202607280002_revoke_legacy_privileges.sql',
  );
  assert.match(migration, /alter table public\.client_error_reports enable row level security/);
  assert.match(migration, /revoke all on public\.client_error_reports from anon, authenticated/);
  assert.doesNotMatch(migration, /drop policy if exists "public submit directory media"/);
  assert.match(postDeploy, /drop policy if exists "public submit directory media"/);
  assert.match(postDeploy, /grant execute on function %s to authenticated/);
  assert.match(migration, /grant execute on function public\.record_client_error/);
});
