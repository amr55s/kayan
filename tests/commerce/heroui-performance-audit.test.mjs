import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Performance: Core marketplace shells and views remain pure Server Components', () => {
  const marketplaceShell = read('components/marketplace/marketplace-shell.tsx');
  const roleShell = read('components/marketplace/role-shell.tsx');
  const productCard = read('components/marketplace/product-card.tsx');
  const productDetails = read('components/marketplace/product-details.tsx');
  const cartView = read('components/marketplace/cart-view.tsx');
  const statePanel = read('components/marketplace/state-panel.tsx');
  const catalogPage = read('app/marketplace/page.tsx');

  assert.doesNotMatch(marketplaceShell, /^'use client'/m, 'MarketplaceShell should be a Server Component');
  assert.doesNotMatch(roleShell, /^'use client'/m, 'RoleShell should be a Server Component');
  assert.doesNotMatch(productCard, /^'use client'/m, 'ProductCard should be a Server Component');
  assert.doesNotMatch(productDetails, /^'use client'/m, 'ProductDetails should be a Server Component');
  assert.doesNotMatch(cartView, /^'use client'/m, 'CartView should be a Server Component');
  assert.doesNotMatch(statePanel, /^'use client'/m, 'StatePanel should be a Server Component');
  assert.doesNotMatch(catalogPage, /^'use client'/m, 'Marketplace page.tsx should be a Server Component');
});

test('Performance: Subpath imports are used for tree-shakeable HeroUI primitives', () => {
  const files = [
    'components/marketplace/marketplace-shell.tsx',
    'components/marketplace/role-shell.tsx',
    'components/marketplace/state-panel.tsx',
    'components/marketplace/product-card.tsx',
    'components/marketplace/product-details.tsx',
    'components/marketplace/product-gallery.tsx',
    'components/marketplace/purchase-form.tsx',
    'components/marketplace/cart-view.tsx',
    'components/marketplace/checkout-form.tsx',
    'components/marketplace/catalog-filters.tsx',
    'components/marketplace/merchant/product-list.tsx',
    'components/marketplace/merchant/product-editor.tsx',
    'components/marketplace/merchant/excel-panel.tsx',
    'components/marketplace/merchant/status-badge.tsx',
    'components/marketplace/admin-memberships-panel.tsx',
    'components/marketplace/operational-setup-panels.tsx',
    'components/marketplace/store-image-manager.tsx',
  ];

  for (const file of files) {
    const content = read(file);
    // Disallow general barrel imports except useOverlayState where required
    if (content.includes("from '@heroui/react'") && !content.includes('useOverlayState')) {
      assert.fail(`File ${file} should use subpath imports from @heroui/react/* instead of the top-level package`);
    }
  }
});

test('Performance: All Next.js Image components define explicit responsive sizes', () => {
  const filesWithImages = [
    'components/marketplace/product-card.tsx',
    'components/marketplace/product-gallery.tsx',
    'components/marketplace/cart-view.tsx',
    'components/marketplace/merchant/product-list.tsx',
    'components/marketplace/merchant/product-gallery-manager.tsx',
    'components/marketplace/store-image-manager.tsx',
    'app/marketplace/orders/[id]/page.tsx',
  ];

  for (const file of filesWithImages) {
    const content = read(file);
    const imageMatches = [...content.matchAll(/<Image\b([^>]*)\/?>/gs)];
    for (const match of imageMatches) {
      assert.match(match[1], /sizes=/, `Image in ${file} must specify a responsive 'sizes' attribute`);
    }
  }
});
