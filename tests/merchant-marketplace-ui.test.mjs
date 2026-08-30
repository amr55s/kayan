import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('merchant marketplace is role-protected and linked without replacing the legacy workspace', () => {
  const layout = read('app/merchant/marketplace/layout.tsx');
  const legacy = read('app/merchant/page.tsx');
  const shell = read('components/marketplace/merchant/merchant-marketplace-shell.tsx');
  const sharedShell = read('components/marketplace/authenticated-marketplace-shell.tsx');
  const marketplaceShell = read('components/marketplace/marketplace-shell.tsx');
  const productList = read('components/marketplace/merchant/product-list.tsx');
  assert.match(layout, /requireProfile\(\['merchant'\]\)/);
  assert.match(legacy, /MerchantOrderWorkspace/);
  assert.match(sharedShell, /\/merchant\/marketplace\/new/);
  assert.match(sharedShell, /\/merchant\/marketplace\/excel/);
  assert.match(sharedShell, /\/merchant\/marketplace\/orders/);
  assert.match(productList, /\/merchant\/marketplace\/new/);
  assert.match(marketplaceShell, /id="main-content"/);
});

test('product editor exposes manual product, variant, inventory and media contracts', () => {
  const editor = read('components/marketplace/merchant/product-editor.tsx');
  const gallery = read('components/marketplace/merchant/product-gallery-manager.tsx');
  assert.match(editor, /from '@heroui\/react\/button'/);
  assert.match(editor, /name="description"/);
  assert.doesNotMatch(editor, /generateDescription|AI description/i);
  for (const field of ['sku', 'barcode', 'weightGrams', 'priceEgp', 'compareAtPriceEgp', 'trackInventory', 'onHand', 'lowStockThreshold', 'isActive']) {
    assert.match(editor, new RegExp(`variantField\\(index, '${field}'\\)`));
  }
  assert.match(editor, /name="expectedUpdatedAt"/);
  assert.match(editor, /name="idempotencyKey"/);
  assert.match(gallery, /MAX_PRODUCT_IMAGES = 10/);
  assert.match(gallery, /uploadMarketplaceImage/);
  assert.match(gallery, /name="orderedAssetIds"/);
  assert.match(gallery, /name="expectedAssetUpdatedAt"/);
});

test('Excel panel renders validation, apply, export, history and failure states', () => {
  const panel = read('components/marketplace/merchant/excel-panel.tsx');
  const page = read('app/merchant/marketplace/excel/page.tsx');
  const persistence = read('lib/commerce/merchant-excel.ts');
  assert.match(panel, /validate-product-workbook/);
  assert.match(panel, /apply-product-workbook/);
  assert.match(panel, /validation\.issues\.map/);
  assert.match(panel, /viewModel\.jobs\.map/);
  assert.match(panel, /name="expectedUpdatedAt"/);
  assert.match(panel, /request\.set\('idempotencyKey'/);
  assert.match(panel, /\/api\/catalog-imports\/files/);
  assert.match(panel, /10 ميجابايت/);
  assert.match(panel, /5,000 منتج/);
  assert.match(panel, /validation\.status === 'processing'/);
  assert.match(panel, /جارٍ معالجة الصور/);
  assert.match(persistence, /images_pending > 0 \? 'processing' : 'valid'/);
  assert.match(page, /\/merchant\/marketplace\/excel\/export/);
  assert.match(page, /processMerchantWorkbookAction/);
});

test('merchant catalog styling stays flat and external-contact free', () => {
  const styles = read('components/marketplace/merchant/merchant-marketplace.module.css');
  assert.doesNotMatch(styles, /(?:linear|radial|conic)-gradient/i);
  assert.doesNotMatch(styles, /border-radius:\s*(?:999|[2-9]\d)px/i);
  for (const file of [
    'components/marketplace/merchant/product-list.tsx',
    'components/marketplace/merchant/product-editor.tsx',
    'components/marketplace/merchant/product-gallery-manager.tsx',
    'components/marketplace/merchant/excel-panel.tsx',
  ]) assert.doesNotMatch(read(file), /wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|tel:/i);
});
