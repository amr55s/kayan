import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseMarketplaceCheckoutFormData } from '../../lib/commerce/cart-input.ts';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

function validCheckoutForm() {
  const form = new FormData();
  form.set('addressId', '');
  form.set('addressLine', '١٢ شارع السوق، بجوار المدرسة');
  form.set('apartment', '٤');
  form.set('building', '١٢');
  form.set('customerName', 'أحمد محمد');
  form.set('deliveryNotes', 'الاتصال عند البوابة');
  form.set('deliveryZoneId', 'b8b77006-571f-4ef4-a283-cd9562d98f2f');
  form.set('floor', '٢');
  form.set('idempotencyKey', '22bf7dc9-b18f-45c2-a853-4d68df90ee1d');
  form.set('landmark', 'المدرسة');
  form.set('recipientPhone', '01012345678');
  form.set('cf-turnstile-response', 'verified-token');
  return form;
}

test('checkout input is bounded and treats a new address explicitly', () => {
  const parsed = parseMarketplaceCheckoutFormData(validCheckoutForm());
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.addressId, null);
  assert.equal(parsed.data.deliveryNotes, 'الاتصال عند البوابة');

  const tooLong = validCheckoutForm();
  tooLong.set('deliveryNotes', 'x'.repeat(501));
  assert.equal(parseMarketplaceCheckoutFormData(tooLong).success, false);

  const invalidIdempotency = validCheckoutForm();
  invalidIdempotency.set('idempotencyKey', 'retry-me');
  assert.equal(parseMarketplaceCheckoutFormData(invalidIdempotency).success, false);
});

test('authenticated checkout uses only caller-derived RPCs and verifies Turnstile', () => {
  const checkout = read('lib/commerce/checkout.ts');
  const actions = read('app/marketplace/actions.ts');
  assert.match(checkout, /preview_my_marketplace_checkout/);
  assert.match(checkout, /save_my_marketplace_address/);
  assert.match(checkout, /checkout_my_marketplace_cart/);
  assert.match(checkout, /p_delivery_notes: input\.form\.deliveryNotes/);
  assert.match(checkout, /verifyTurnstileToken/);
  assert.doesNotMatch(checkout, /createAdminClient|p_customer_id/);
  assert.match(actions, /deliveryMode:/);
  assert.match(actions, /redirect\(destination\)/);
});

test('guest cart claim and checkout routes preserve the in-site flow', () => {
  const cart = read('lib/commerce/cart.ts');
  const form = read('components/marketplace/checkout-form.tsx');
  const checkoutPage = read('app/marketplace/checkout/page.tsx');
  const orderPage = read('app/marketplace/orders/[id]/page.tsx');
  assert.match(cart, /claim_my_guest_marketplace_cart/);
  assert.match(checkoutPage, /cart\/claim\?next=%2Fmarketplace%2Fcheckout/);
  assert.match(form, /name="idempotencyKey"/);
  assert.match(form, /name={`deliveryMode:\$\{option\.storeId\}`}/);
  assert.match(form, /name="deliveryNotes"/);
  assert.match(orderPage, /الدفع نقدًا عند الاستلام/);
  for (const source of [cart, form, orderPage]) {
    assert.doesNotMatch(source, /wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|tel:/i);
  }
});
