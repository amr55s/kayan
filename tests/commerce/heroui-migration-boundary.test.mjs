import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Batch 1: Shells and state panels use HeroUI primitives and do not expose unstyled buttons or badges', () => {
  const marketplaceShell = read('components/marketplace/marketplace-shell.tsx');
  const roleShell = read('components/marketplace/role-shell.tsx');
  const merchantShell = read('components/marketplace/merchant/merchant-marketplace-shell.tsx');
  const statePanel = read('components/marketplace/state-panel.tsx');

  assert.match(marketplaceShell, /from '@heroui\/react\/badge'/);
  assert.match(roleShell, /from '@heroui\/react\/chip'/);
  assert.match(roleShell, /from '@heroui\/react\/card'/);
  assert.match(statePanel, /from '@\/components\/ui\/dairtak-link'/);
  assert.match(statePanel, /<DairtakLink href=\{actionHref\}/);
  assert.doesNotMatch(statePanel, /<Button/);
  assert.match(statePanel, /from '@heroui\/react\/skeleton'/);
  assert.match(statePanel, /from '@heroui\/react\/empty-state'/);
});

test('Batch 2: Customer marketplace components use HeroUI compound primitives', () => {
  const productCard = read('components/marketplace/product-card.tsx');
  const productDetails = read('components/marketplace/product-details.tsx');
  const productGallery = read('components/marketplace/product-gallery.tsx');
  const purchaseForm = read('components/marketplace/purchase-form.tsx');
  const cartView = read('components/marketplace/cart-view.tsx');
  const checkoutForm = read('components/marketplace/checkout-form.tsx');

  assert.match(productCard, /from '@heroui\/react\/card'/);
  assert.match(productCard, /from '@heroui\/react\/button'/);
  assert.match(productDetails, /from '@heroui\/react\/separator'/);
  assert.match(productDetails, /from '@heroui\/react\/card'/);
  assert.match(productGallery, /from '@heroui\/react\/scroll-shadow'/);
  assert.match(purchaseForm, /from '@heroui\/react\/radio-group'/);
  assert.match(cartView, /from '@heroui\/react\/card'/);
  assert.match(cartView, /from '@heroui\/react\/separator'/);
  assert.match(checkoutForm, /from '@heroui\/react\/card'/);
  assert.match(checkoutForm, /from '@heroui\/react\/button'/);
});

test('Batch 3: Merchant marketplace components use HeroUI compound primitives', () => {
  const productList = read('components/marketplace/merchant/product-list.tsx');
  const productEditor = read('components/marketplace/merchant/product-editor.tsx');
  const excelPanel = read('components/marketplace/merchant/excel-panel.tsx');
  const galleryManager = read('components/marketplace/merchant/product-gallery-manager.tsx');

  assert.match(productList, /from '@heroui\/react\/button'/);
  assert.match(productEditor, /from '@heroui\/react\/alert'/);
  assert.match(productEditor, /from '@heroui\/react\/checkbox'/);
  assert.match(excelPanel, /from '@heroui\/react\/alert'/);
  assert.match(excelPanel, /from '@heroui\/react\/spinner'/);
  assert.match(galleryManager, /from '@heroui\/react\/button'/);
});

test('Batch 4: Admin and Driver operations panels use HeroUI compound primitives', () => {
  const adminMemberships = read('components/marketplace/admin-memberships-panel.tsx');
  const storeImageManager = read('components/marketplace/store-image-manager.tsx');
  const operationsPanels = read('components/commerce-operations/operations-panels.tsx');

  assert.match(adminMemberships, /from '@heroui\/react\/checkbox'/);
  assert.match(adminMemberships, /from '@heroui\/react\/button'/);
  assert.match(storeImageManager, /from '@heroui\/react\/chip'/);
  assert.match(operationsPanels, /from '@heroui\/react\/button'/);
});

test('Theme alignment: marketplace uses the shared HeroUI v3 semantic theme', () => {
  const css = read('app/globals.css');
  const shell = read('components/marketplace/marketplace-shell.tsx');
  assert.match(shell, /dairtak-theme/);
  assert.match(css, /\.dairtak-theme\s*\{/);
  assert.match(css, /--accent: var\(--dairtak-orange\)/);
  assert.match(css, /--background: var\(--kayan-surface\)/);
  assert.match(css, /--foreground: var\(--kayan-black\)/);
  assert.match(css, /--border: var\(--kayan-border\)/);
  assert.match(css, /--focus: var\(--dairtak-orange-deep\)/);
});
