import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as navigation from '../../lib/auth/safe-next.ts';
import * as intentCookie from '../../lib/auth/chat-intent-cookie.ts';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const storeId = '4a87a29f-803b-4e0d-af3e-55d7dc54af64';
const productId = '7182ed18-22e8-4b9d-b528-9c33f81c4a53';
const orderId = 'df80bb8c-59f6-409b-8458-b1e5c3c28280';
const flowA = 'f2616187-4f06-422c-8690-58f442023a2c';
const flowB = 'f5e4689f-995f-46a7-a25f-15d5a42d41f0';
const secret = 'test-only-intent-secret-that-is-at-least-32-bytes';
const issuedAt = Date.parse('2026-08-28T10:00:00.000Z');

test('OAuth return paths reject encoded redirect tricks and retain allowed internal queries', () => {
  assert.equal(
    navigation.sanitizeNextPath?.('/account/chat?store=valid', '/marketplace'),
    '/account/chat?store=valid',
  );
  for (const malicious of [
    'https://evil.example/chat',
    '//evil.example/chat',
    '/%2f%2fevil.example/chat',
    '/%255c%255cevil.example/chat',
    '/marketplace/%0d%0aLocation:%20https://evil.example',
    '/marketplace?next=%252F%252Fevil.example/chat',
    '/api/private?next=/marketplace',
  ]) {
    assert.equal(
      navigation.sanitizeNextPath?.(malicious, '/marketplace'),
      '/marketplace',
      malicious,
    );
  }
});

test('store and product chat login hrefs carry only validated intent fields and one final return path', () => {
  assert.equal(typeof navigation.createChatLoginHref, 'function');
  const storeHref = navigation.createChatLoginHref({
    returnTo: '/marketplace?store=groceries',
    intent: { kind: 'presale', storeId, productId: null },
  });
  const productHref = navigation.createChatLoginHref({
    returnTo: `/marketplace/products/${productId}/olive-oil?variant=large`,
    intent: { kind: 'presale', storeId, productId },
  });

  assert.equal(
    storeHref,
    `/signin?next=%2Fmarketplace%3Fstore%3Dgroceries&intent=chat&kind=presale&storeId=${storeId}`,
  );
  assert.equal(
    productHref,
    `/signin?next=%2Fmarketplace%2Fproducts%2F${productId}%2Folive-oil%3Fvariant%3Dlarge&intent=chat&kind=presale&storeId=${storeId}&productId=${productId}`,
  );
  assert.throws(
    () => navigation.createChatLoginHref({
      returnTo: '/marketplace',
      intent: { kind: 'presale', storeId: 'not-a-uuid', productId: null },
    }),
    /invalid_chat_intent/,
  );
});

test('signed chat intent is tamper-evident, expires, and binds to the exact callback flow and return path', () => {
  assert.equal(typeof intentCookie.signChatIntentCookie, 'function');
  assert.equal(typeof intentCookie.verifyChatIntentCookie, 'function');
  const signed = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowA,
    returnTo: `/marketplace/orders/${orderId}?tab=details`,
    intent: { kind: 'order', orderId },
  });

  assert.deepEqual(
    intentCookie.verifyChatIntentCookie(signed.value, {
      secret,
      now: issuedAt + 30_000,
      flowId: flowA,
      returnTo: `/marketplace/orders/${orderId}?tab=details`,
    }),
    { status: 'valid', intent: { kind: 'order', orderId } },
  );
  assert.deepEqual(
    intentCookie.verifyChatIntentCookie(`${signed.value.slice(0, -1)}x`, {
      secret,
      now: issuedAt + 30_000,
      flowId: flowA,
      returnTo: `/marketplace/orders/${orderId}?tab=details`,
    }),
    { status: 'invalid' },
  );
  assert.deepEqual(
    intentCookie.verifyChatIntentCookie(signed.value, {
      secret,
      now: issuedAt + 601_000,
      flowId: flowA,
      returnTo: `/marketplace/orders/${orderId}?tab=details`,
    }),
    { status: 'expired' },
  );
  assert.deepEqual(
    intentCookie.verifyChatIntentCookie(signed.value, {
      secret,
      now: issuedAt + 30_000,
      flowId: flowA,
      returnTo: '/marketplace',
    }),
    { status: 'mismatch' },
  );
});

test('a callback from another tab cannot consume or replay the current chat flow', () => {
  const signed = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowB,
    returnTo: `/marketplace/products/${productId}/olive-oil`,
    intent: { kind: 'presale', storeId, productId },
  });
  assert.deepEqual(
    intentCookie.verifyChatIntentCookie(signed.value, {
      secret,
      now: issuedAt + 10_000,
      flowId: flowA,
      returnTo: `/marketplace/products/${productId}/olive-oil`,
    }),
    { status: 'mismatch' },
  );
  assert.equal(
    intentCookie.verifyChatIntentCookie(signed.value, {
      secret,
      now: issuedAt + 10_000,
      flowId: flowB,
      returnTo: `/marketplace/products/${productId}/olive-oil`,
    }).status,
    'valid',
  );
});

test('checkout and chat expose Google first without an anonymous or service-role submission fallback', () => {
  const checkout = read('components/marketplace/checkout-form.tsx');
  const checkoutService = read('lib/commerce/checkout.ts');
  const entry = read('components/marketplace/chat/chat-entry-button.tsx');
  const callback = read('app/auth/callback/route.ts');

  assert.match(checkout, /MarketplaceCheckoutLogin[\s\S]*GoogleSignInButton/);
  assert.match(entry, /openMarketplaceConversationAction/);
  assert.match(entry, /GoogleSignInButton/);
  assert.doesNotMatch(entry, /https?:\/\//);
  assert.doesNotMatch(checkoutService, /createAdminClient|service_role|p_customer_id/);
  assert.match(checkoutService, /authentication_required/);
  assert.match(callback, /claimMarketplaceGuestCart[\s\S]*openMarketplaceConversationAction/);
});

test('OAuth cancellation retains a retryable final destination while successful callbacks consume once', () => {
  const oauth = read('lib/auth/oauth-actions.ts');
  const callback = read('app/auth/callback/route.ts');
  const googleButton = read('components/auth/GoogleSignInButton.tsx');

  assert.deepEqual(intentCookie.chatIntentCookie.options, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
  assert.match(oauth, /chatIntentCookie\.options/);
  assert.match(callback, /oauth_callback/);
  assert.match(callback, /cookieStore\.delete/);
  assert.match(googleButton, /label/);
  assert.doesNotMatch(googleButton, /next=\{loginHref\}/);
});
