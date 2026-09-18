import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { marketplaceStoreHref } from '../../components/marketplace/format.ts';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('catalog listing wires add-to-cart and only submits a default in-stock variant', () => {
  const page = read('app/marketplace/page.tsx');
  const card = read('components/marketplace/product-card.tsx');
  assert.match(page, /addToCartAction=\{addMarketplaceCartItemAction\}/);
  assert.match(card, /canAddToCart/);
  assert.match(card, /defaultVariantId && product\.isInStock/);
  assert.match(card, /name="variantId"/);
  assert.match(card, /marketplaceStoreHref\(product\.store\.slug\)/);
});

test('product details expose store breadcrumbs, store link, and related products', () => {
  const details = read('components/marketplace/product-details.tsx');
  const productPage = read('app/marketplace/products/[id]/[slug]/page.tsx');
  assert.match(details, /from '@heroui\/react\/breadcrumbs'/);
  assert.match(details, /relatedProducts/);
  assert.match(details, /المزيد من/);
  assert.match(productPage, /fetchRelatedMarketplaceProducts/);
});

test('cart quantity uses immediate stepper submits and keeps line totals on a third grid column', () => {
  const cart = read('components/marketplace/cart-view.tsx');
  const css = read('components/marketplace/marketplace.module.css');
  assert.match(cart, /aria-label="تقليل الكمية"/);
  assert.match(cart, /aria-label="زيادة الكمية"/);
  assert.match(cart, /name="quantity"/);
  assert.match(css, /\.cartLine\s*\{[\s\S]*grid-template-columns:\s*5rem minmax\(0, 1fr\) auto/);
  assert.match(css, /\.quantityStepper/);
});

test('checkout uses DairtakSelect and shopper notices use HeroUI Alert', () => {
  const checkout = read('components/marketplace/checkout-form.tsx');
  const cartPage = read('app/marketplace/cart/page.tsx');
  const checkoutPage = read('app/marketplace/checkout/page.tsx');
  assert.match(checkout, /from '@\/components\/ui\/dairtak-select'/);
  assert.match(checkout, /name=\{`deliveryMode:\$\{option\.storeId\}`\}/);
  assert.doesNotMatch(checkout, /<select\b/);
  assert.match(cartPage, /MarketplaceNotice/);
  assert.match(checkoutPage, /MarketplaceNotice/);
});

test('public marketplace shell shows cart count and admin marketplace index redirects', () => {
  const layout = read('app/marketplace/layout.tsx');
  const shell = read('components/marketplace/marketplace-shell.tsx');
  const adminIndex = read('app/admin/marketplace/page.tsx');
  const proxy = read('proxy.ts');
  assert.match(layout, /loadMarketplaceCart/);
  assert.match(layout, /cartCount=\{cartCount\}/);
  assert.match(shell, /cartCount/);
  assert.match(adminIndex, /redirect\('\/admin\/marketplace\/orders'\)/);
  assert.match(proxy, /'\/account\/:path\*'/);
  assert.match(proxy, /'\/marketplace\/cart'/);
  assert.match(proxy, /'\/marketplace\/checkout'/);
});

test('store href helper keeps catalog filtering on the public marketplace', () => {
  assert.equal(marketplaceStoreHref('my-store'), '/marketplace?store=my-store');
  assert.equal(marketplaceStoreHref('متجر'), '/marketplace?store=%D9%85%D8%AA%D8%AC%D8%B1');
});
