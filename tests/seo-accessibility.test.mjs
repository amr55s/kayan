import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { serializeJsonLd } from '../lib/seo/json-ld.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('public sitemap SQL exposes only bounded active catalog identifiers', () => {
  const migration = read('supabase/migrations/20260810082000_marketplace_seo.sql');
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /returns table \(\s*id uuid,\s*slug text,\s*updated_at timestamptz\s*\)/i);
  assert.match(migration, /store\.status = 'published'[\s\S]*product\.status = 'active'/i);
  assert.match(migration, /p_page not between 1 and 10000/i);
  assert.match(migration, /p_page_size not between 1 and 50000/i);
  assert.match(migration, /revoke all on function public\.list_marketplace_sitemap_products[\s\S]*from public/i);
  assert.match(migration, /grant execute on function public\.list_marketplace_sitemap_products[\s\S]*to anon, authenticated/i);
  assert.doesNotMatch(migration, /email|phone|address|customer/i);
});

test('robots and sitemap keep private flows out and cap every sitemap file', () => {
  const robots = read('app/robots.ts');
  const sitemap = read('app/sitemap.ts');
  for (const route of [
    '/account', '/admin', '/api', '/auth', '/driver', '/login', '/merchant',
    '/orders', '/signin', '/marketplace/cart', '/marketplace/checkout',
    '/marketplace/orders',
  ]) assert.match(robots, new RegExp(route.replaceAll('/', '\\/')));
  assert.match(robots, /generateSitemaps/);
  assert.match(robots, /revalidate = 3600/);
  assert.match(sitemap, /SITEMAP_PAGE_SIZE = 50_000/);
  assert.match(sitemap, /revalidate = 3600/);
  assert.match(sitemap, /count_marketplace_sitemap_products/);
  assert.match(sitemap, /list_marketplace_sitemap_products/);
  assert.match(sitemap, /catch \{\s*return (?:0|\[\]);/g);
});

test('canonical metadata is route-specific and products emit injection-safe JSON-LD', () => {
  const root = read('app/layout.tsx');
  const marketplace = read('app/marketplace/layout.tsx');
  const services = read('app/services/page.tsx');
  const product = read('app/marketplace/products/[id]/[slug]/page.tsx');
  assert.doesNotMatch(root, /alternates:\s*\{\s*canonical:\s*['"]\/['"]/);
  assert.match(marketplace, /alternates:\s*\{\s*canonical:\s*['"]\/['"]/);
  assert.match(services, /alternates:\s*\{\s*canonical:\s*['"]\/services['"]/);
  assert.match(product, /application\/ld\+json/);
  assert.match(product, /product\.rating\.count > 0[\s\S]*aggregateRating/);
  assert.match(product, /priceCurrency:\s*'EGP'/);
  assert.match(product, /summary_large_image/);

  const encoded = serializeJsonLd({ name: '</script><script>alert(1)</script>', amp: '&' });
  assert.doesNotMatch(encoded, /<|>|&/);
  assert.match(encoded, /\\u003c\/script\\u003e/);
});

test('private route families are noindex and the global skip target remains reachable', () => {
  for (const route of ['account', 'admin', 'driver', 'merchant', 'login', 'signin']) {
    assert.match(read(`app/${route}/layout.tsx`), /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  }
  assert.match(read('app/layout.tsx'), /href="#main-content"/);
  assert.match(read('components/auth/LoginForm.tsx'), /<main id="main-content"/);
  assert.match(read('components/marketplace/marketplace-shell.tsx'), /<main id="main-content"/);
  assert.match(read('components/marketplace/product-gallery.tsx'), /role="group"[\s\S]*aria-label=/);
  assert.match(read('components/marketplace/state-panel.tsx'), /role=\{kind === 'error' \? 'alert'/);
});
