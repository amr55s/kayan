import assert from 'node:assert/strict';
import test from 'node:test';

import * as navigation from '../../lib/auth/safe-next.ts';
import * as intentCookie from '../../lib/auth/chat-intent-cookie.ts';

const oauthFlow = await import('../../lib/auth/oauth-flow.ts').catch(() => null);
const callbackFlow = await import('../../lib/auth/callback-flow.ts').catch(() => null);
const entryState = await import('../../components/marketplace/chat/chat-entry-state.ts').catch(() => null);
const checkoutState = await import('../../components/marketplace/checkout-state.ts').catch(() => null);
const storeChat = await import('../../lib/commerce/store-chat.ts').catch(() => null);

const storeA = '4a87a29f-803b-4e0d-af3e-55d7dc54af64';
const storeB = '236957b7-4bb9-405f-956d-338fb3442719';
const productA = '7182ed18-22e8-4b9d-b528-9c33f81c4a53';
const productB = '8fa4e845-220d-44d1-8c73-50eaa81496cb';
const orderId = 'df80bb8c-59f6-409b-8458-b1e5c3c28280';
const flowA = 'f2616187-4f06-422c-8690-58f442023a2c';
const flowB = 'f5e4689f-995f-46a7-a25f-15d5a42d41f0';
const secret = 'test-only-intent-secret-that-is-at-least-32-bytes';
const issuedAt = Date.parse('2026-08-28T10:00:00.000Z');
const siteUrl = 'https://shop.example';

function intent(storeId, productId) {
  return { kind: 'presale', storeId, productId };
}

function memoryCookie(initial = null) {
  let value = initial;
  const mutations = [];
  return {
    get value() { return value; },
    mutations,
    read: () => value,
    write(next) { value = next; mutations.push(['write', next]); },
    delete() { value = null; mutations.push(['delete']); },
  };
}

function requireModule(module, name) {
  assert.ok(module, `${name} behavioral module is missing`);
  return module;
}

test('OAuth return paths decode until stable and reject nested authority, scheme, and separator tricks', () => {
  const nested = (value, passes) => {
    let result = value;
    for (let index = 0; index < passes; index += 1) result = encodeURIComponent(result);
    return result;
  };
  assert.equal(
    navigation.sanitizeNextPath('/account/chat?store=valid#thread', '/marketplace'),
    '/account/chat?store=valid#thread',
  );
  for (const malicious of [
    'https://evil.example/chat',
    '//evil.example/chat',
    `/marketplace?next=${nested('//evil.example/chat', 12)}`,
    `/marketplace?next=${nested('\\\\evil.example/chat', 12)}`,
    `/marketplace?next=${nested('javascript:alert(1)', 9)}`,
    `/marketplace#next=${nested('data:text/html,bad', 7)}`,
    `/marketplace?x=${encodeURIComponent('\r\nLocation: https://evil.example')}`,
    `/marketplace/${encodeURIComponent('\u2028')}evil`,
    `/marketplace?x=${encodeURIComponent('\u2029')}evil`,
    '/api/private?next=/marketplace',
  ]) {
    assert.equal(navigation.sanitizeNextPath(malicious, '/marketplace'), '/marketplace', malicious);
  }
});

test('signed flow inspection preserves exact intent shapes, phase, expiry, and tamper evidence', () => {
  assert.equal(typeof intentCookie.inspectChatIntentCookie, 'function');
  const signed = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowA,
    returnTo: `/marketplace/orders/${orderId}?tab=details`,
    intent: { kind: 'order', orderId },
    phase: 'oauth',
  });
  assert.deepEqual(
    intentCookie.inspectChatIntentCookie(signed.value, { secret, now: issuedAt + 30_000 }),
    {
      status: 'valid',
      flow: {
        flowId: flowA,
        returnTo: `/marketplace/orders/${orderId}?tab=details`,
        intent: { kind: 'order', orderId },
        phase: 'oauth',
      },
    },
  );
  assert.deepEqual(
    intentCookie.inspectChatIntentCookie(`${signed.value.slice(0, -1)}x`, {
      secret,
      now: issuedAt + 30_000,
    }),
    { status: 'invalid' },
  );
  assert.deepEqual(
    intentCookie.inspectChatIntentCookie(signed.value, { secret, now: issuedAt + 601_000 }),
    { status: 'expired' },
  );
});

test('two tabs serialize fixed-key PKCE without overwriting the first signed intent', async () => {
  const { startGoogleOAuthFlow } = requireModule(oauthFlow, 'oauth-flow');
  const cookie = memoryCookie();
  let oauthStarts = 0;
  let authenticated = false;
  const common = {
    secret,
    siteUrl,
    now: () => issuedAt,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    isAuthenticated: async () => authenticated,
    startOAuth: async (callbackUrl) => {
      oauthStarts += 1;
      return `https://auth.example/authorize?redirect=${encodeURIComponent(callbackUrl)}`;
    },
  };
  const first = await startGoogleOAuthFlow(
    { next: '/marketplace?store=a', intent: intent(storeA, productA) },
    { ...common, randomFlowId: () => flowA },
  );
  const firstCookie = cookie.value;
  const second = await startGoogleOAuthFlow(
    { next: '/marketplace?store=b', intent: intent(storeB, productB) },
    { ...common, randomFlowId: () => flowB },
  );

  assert.equal(first.success, true);
  assert.equal(second.success, false);
  assert.equal(second.code, 'oauth_in_progress');
  assert.equal(oauthStarts, 1);
  assert.equal(cookie.value, firstCookie, 'tab B must not overwrite tab A intent');

  cookie.delete();
  authenticated = true;
  const sharedSessionRetry = await startGoogleOAuthFlow(
    { next: '/marketplace?store=b', intent: intent(storeB, productB) },
    { ...common, randomFlowId: () => flowB },
  );
  assert.deepEqual(sharedSessionRetry, { success: true, url: '/marketplace?store=b' });
  assert.equal(oauthStarts, 1, 'an existing shared session must not start another PKCE flow');
});

test('stale and cancelled flows can be replaced but active recovery cannot be overwritten', async () => {
  const { startGoogleOAuthFlow } = requireModule(oauthFlow, 'oauth-flow');
  const stale = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt - 700_000,
    flowId: flowA,
    returnTo: '/marketplace?store=a',
    intent: intent(storeA, null),
    phase: 'oauth',
  }).value;
  const cookie = memoryCookie(stale);
  let starts = 0;
  const dependencies = {
    secret,
    siteUrl,
    now: () => issuedAt,
    randomFlowId: () => flowB,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    isAuthenticated: async () => false,
    startOAuth: async () => { starts += 1; return 'https://auth.example/new'; },
  };
  assert.equal((await startGoogleOAuthFlow({ next: '/marketplace', intent: null }, dependencies)).success, true);
  assert.equal(starts, 1);

  const recovery = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowA,
    returnTo: '/marketplace?store=a',
    intent: intent(storeA, null),
    phase: 'recovery',
  }).value;
  const recoveryCookie = memoryCookie(recovery);
  const blocked = await startGoogleOAuthFlow(
    { next: '/marketplace?store=b', intent: intent(storeB, null) },
    { ...dependencies, readCookie: recoveryCookie.read, writeCookie: recoveryCookie.write },
  );
  assert.equal(blocked.code, 'oauth_in_progress');
  assert.equal(recoveryCookie.value, recovery);
});

test('successful callback preserves profile-cart-chat ordering and consumes only its exact flow', async () => {
  const { handleGoogleOAuthCallback } = requireModule(callbackFlow, 'callback-flow');
  const signed = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowA,
    returnTo: '/marketplace?store=a&sort=newest',
    intent: intent(storeA, null),
    phase: 'oauth',
  }).value;
  const cookie = memoryCookie(signed);
  const events = [];
  const result = await handleGoogleOAuthCallback({
    requestUrl: `${siteUrl}/auth/callback?code=good&flow=${flowA}&next=${encodeURIComponent('/marketplace?store=a&sort=newest')}`,
  }, {
    siteUrl,
    secret,
    now: () => issuedAt + 30_000,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    exchangeCode: async () => { events.push('exchange'); },
    ensureCustomer: async () => { events.push('profile'); },
    claimGuestCart: async () => { events.push('cart'); },
    openConversation: async () => { events.push('chat'); return { status: 'sent' }; },
  });

  assert.deepEqual(events, ['exchange', 'profile', 'cart', 'chat']);
  assert.equal(result.redirectTo, `${siteUrl}/marketplace?store=a&sort=newest`);
  assert.equal(cookie.value, null);
  assert.deepEqual(cookie.mutations.at(-1), ['delete']);
});

test('cancellation retains intent as replaceable state and never exchanges or opens chat', async () => {
  const { handleGoogleOAuthCallback } = requireModule(callbackFlow, 'callback-flow');
  const signed = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowA,
    returnTo: `/marketplace/products/${productA}/item`,
    intent: intent(storeA, productA),
    phase: 'oauth',
  }).value;
  const cookie = memoryCookie(signed);
  let sideEffects = 0;
  const result = await handleGoogleOAuthCallback({
    requestUrl: `${siteUrl}/auth/callback?error=access_denied&flow=${flowA}&next=${encodeURIComponent(`/marketplace/products/${productA}/item`)}`,
  }, {
    siteUrl,
    secret,
    now: () => issuedAt + 20_000,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    exchangeCode: async () => { sideEffects += 1; },
    ensureCustomer: async () => { sideEffects += 1; },
    claimGuestCart: async () => { sideEffects += 1; },
    openConversation: async () => { sideEffects += 1; return { status: 'sent' }; },
  });

  assert.equal(sideEffects, 0);
  assert.equal(new URL(result.redirectTo).searchParams.get('error'), 'oauth_callback');
  assert.equal(
    intentCookie.inspectChatIntentCookie(cookie.value, { secret, now: issuedAt + 20_000 }).flow.phase,
    'cancelled',
  );
});

test('a mismatched callback cannot exchange a code or consume another tab flow', async () => {
  const { handleGoogleOAuthCallback } = requireModule(callbackFlow, 'callback-flow');
  const signed = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowA,
    returnTo: '/marketplace?store=a',
    intent: intent(storeA, null),
    phase: 'oauth',
  }).value;
  const cookie = memoryCookie(signed);
  let exchanges = 0;
  const result = await handleGoogleOAuthCallback({
    requestUrl: `${siteUrl}/auth/callback?code=wrong-tab&flow=${flowB}&next=${encodeURIComponent('/marketplace?store=b')}`,
  }, {
    siteUrl,
    secret,
    now: () => issuedAt + 20_000,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    exchangeCode: async () => { exchanges += 1; },
    ensureCustomer: async () => {},
    claimGuestCart: async () => {},
    openConversation: async () => ({ status: 'sent' }),
  });
  assert.equal(exchanges, 0);
  assert.equal(cookie.value, signed);
  assert.equal(new URL(result.redirectTo).searchParams.get('error'), 'oauth_callback');
});

test('a cancelled flow callback replay cannot exchange or automatically open its intent', async () => {
  const { handleGoogleOAuthCallback } = requireModule(callbackFlow, 'callback-flow');
  const signed = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowA,
    returnTo: '/marketplace?store=a',
    intent: intent(storeA, null),
    phase: 'cancelled',
  }).value;
  const cookie = memoryCookie(signed);
  let sideEffects = 0;
  const result = await handleGoogleOAuthCallback({
    requestUrl: `${siteUrl}/auth/callback?code=replayed&flow=${flowA}&next=${encodeURIComponent('/marketplace?store=a')}`,
  }, {
    siteUrl,
    secret,
    now: () => issuedAt + 20_000,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    exchangeCode: async () => { sideEffects += 1; },
    ensureCustomer: async () => { sideEffects += 1; },
    claimGuestCart: async () => { sideEffects += 1; },
    openConversation: async () => { sideEffects += 1; return { status: 'sent' }; },
  });
  assert.equal(sideEffects, 0);
  assert.equal(cookie.value, signed);
  assert.equal(new URL(result.redirectTo).searchParams.get('error'), 'oauth_callback');
});

test('temporary chat-open failure retains recovery, redirects visibly, and explicit retry consumes it', async () => {
  const { handleGoogleOAuthCallback, retryRecoveredChatIntent } = requireModule(callbackFlow, 'callback-flow');
  const returnTo = `/marketplace/products/${productA}/item?variant=large`;
  const chatIntent = intent(storeA, productA);
  const signed = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowA,
    returnTo,
    intent: chatIntent,
    phase: 'oauth',
  }).value;
  const cookie = memoryCookie(signed);
  let opens = 0;
  const dependencies = {
    siteUrl,
    secret,
    now: () => issuedAt + 30_000,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    exchangeCode: async () => {},
    ensureCustomer: async () => {},
    claimGuestCart: async () => {},
    openConversation: async () => {
      opens += 1;
      return { status: 'error', code: 'service_unavailable' };
    },
  };
  const callbackResult = await handleGoogleOAuthCallback({
    requestUrl: `${siteUrl}/auth/callback?code=good&flow=${flowA}&next=${encodeURIComponent(returnTo)}`,
  }, dependencies);
  const recoveryUrl = new URL(callbackResult.redirectTo);

  assert.equal(recoveryUrl.pathname + recoveryUrl.search.replace(/&?chat_recovery=[^&]+/u, ''), returnTo);
  assert.equal(recoveryUrl.searchParams.get('chat_recovery'), 'service_unavailable');
  assert.equal(opens, 1);
  assert.equal(
    intentCookie.inspectChatIntentCookie(cookie.value, { secret, now: issuedAt + 30_000 }).flow.phase,
    'recovery',
  );

  dependencies.openConversation = async () => { opens += 1; return { status: 'sent' }; };
  const retried = await retryRecoveredChatIntent({ intent: chatIntent, returnTo }, dependencies);
  assert.deepEqual(retried, { status: 'sent' });
  assert.equal(opens, 2);
  assert.equal(cookie.value, null);
});

test('replayed callback never automatically reopens a recovery intent', async () => {
  const { handleGoogleOAuthCallback } = requireModule(callbackFlow, 'callback-flow');
  const returnTo = `/marketplace/products/${productA}/item`;
  const recovery = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowA,
    returnTo,
    intent: intent(storeA, productA),
    phase: 'recovery',
  }).value;
  const cookie = memoryCookie(recovery);
  let opens = 0;
  const result = await handleGoogleOAuthCallback({
    requestUrl: `${siteUrl}/auth/callback?code=replayed&flow=${flowA}&next=${encodeURIComponent(returnTo)}`,
  }, {
    siteUrl,
    secret,
    now: () => issuedAt + 40_000,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    exchangeCode: async () => {},
    ensureCustomer: async () => {},
    claimGuestCart: async () => {},
    openConversation: async () => { opens += 1; return { status: 'sent' }; },
  });
  assert.equal(opens, 0);
  assert.equal(new URL(result.redirectTo).searchParams.get('chat_recovery'), 'service_unavailable');
  assert.equal(cookie.value, recovery);
});

test('a no-code callback retry cannot downgrade or consume a recovery intent', async () => {
  const { handleGoogleOAuthCallback } = requireModule(callbackFlow, 'callback-flow');
  const returnTo = `/marketplace/products/${productA}/item`;
  const recovery = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowA,
    returnTo,
    intent: intent(storeA, productA),
    phase: 'recovery',
  }).value;
  const cookie = memoryCookie(recovery);
  const result = await handleGoogleOAuthCallback({
    requestUrl: `${siteUrl}/auth/callback?error=access_denied&flow=${flowA}&next=${encodeURIComponent(returnTo)}`,
  }, {
    siteUrl,
    secret,
    now: () => issuedAt + 40_000,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    exchangeCode: async () => assert.fail('must not exchange'),
    ensureCustomer: async () => assert.fail('must not provision'),
    claimGuestCart: async () => assert.fail('must not claim'),
    openConversation: async () => assert.fail('must not auto-open'),
  });
  assert.equal(new URL(result.redirectTo).searchParams.get('chat_recovery'), 'service_unavailable');
  assert.equal(cookie.value, recovery);
  assert.equal(
    intentCookie.inspectChatIntentCookie(cookie.value, { secret, now: issuedAt + 40_000 }).flow.phase,
    'recovery',
  );
});

test('exchange failure makes the exact flow immediately replaceable without discarding intent', async () => {
  const { handleGoogleOAuthCallback } = requireModule(callbackFlow, 'callback-flow');
  const { startGoogleOAuthFlow } = requireModule(oauthFlow, 'oauth-flow');
  const returnTo = `/marketplace/products/${productA}/item`;
  const chatIntent = intent(storeA, productA);
  const signed = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowA,
    returnTo,
    intent: chatIntent,
    phase: 'oauth',
  }).value;
  const cookie = memoryCookie(signed);
  const failed = await handleGoogleOAuthCallback({
    requestUrl: `${siteUrl}/auth/callback?code=bad&flow=${flowA}&next=${encodeURIComponent(returnTo)}`,
  }, {
    siteUrl,
    secret,
    now: () => issuedAt + 20_000,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    exchangeCode: async () => { throw new Error('exchange_failed'); },
    ensureCustomer: async () => assert.fail('must not provision'),
    claimGuestCart: async () => assert.fail('must not claim'),
    openConversation: async () => assert.fail('must not open'),
  });
  assert.equal(new URL(failed.redirectTo).searchParams.get('error'), 'profile_setup');
  assert.deepEqual(
    intentCookie.inspectChatIntentCookie(cookie.value, { secret, now: issuedAt + 20_000 }).flow,
    { flowId: flowA, returnTo, intent: chatIntent, phase: 'cancelled' },
  );

  let starts = 0;
  const retried = await startGoogleOAuthFlow({ next: returnTo, intent: chatIntent }, {
    secret,
    siteUrl,
    now: () => issuedAt + 20_001,
    randomFlowId: () => flowB,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    isAuthenticated: async () => false,
    startOAuth: async () => { starts += 1; return 'https://auth.example/retry'; },
  });
  assert.equal(retried.success, true);
  assert.equal(starts, 1);
  assert.equal(
    intentCookie.inspectChatIntentCookie(cookie.value, { secret, now: issuedAt + 20_001 }).flow.flowId,
    flowB,
  );
});

test('customer setup failure becomes non-replayable recovery and explicit retry completes it', async () => {
  const { handleGoogleOAuthCallback, retryRecoveredChatIntent } = requireModule(callbackFlow, 'callback-flow');
  const returnTo = `/marketplace/products/${productA}/item?variant=large`;
  const chatIntent = intent(storeA, productA);
  const signed = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowA,
    returnTo,
    intent: chatIntent,
    phase: 'oauth',
  }).value;
  const cookie = memoryCookie(signed);
  let exchanges = 0;
  const failed = await handleGoogleOAuthCallback({
    requestUrl: `${siteUrl}/auth/callback?code=good&flow=${flowA}&next=${encodeURIComponent(returnTo)}`,
  }, {
    siteUrl,
    secret,
    now: () => issuedAt + 20_000,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    exchangeCode: async () => { exchanges += 1; },
    ensureCustomer: async () => { throw new Error('profile_failed'); },
    claimGuestCart: async () => assert.fail('must not claim before customer'),
    openConversation: async () => assert.fail('must not open before customer'),
  });
  assert.equal(exchanges, 1);
  assert.equal(new URL(failed.redirectTo).searchParams.get('chat_recovery'), 'profile_setup');
  assert.equal(
    intentCookie.inspectChatIntentCookie(cookie.value, { secret, now: issuedAt + 20_000 }).flow.phase,
    'profile_recovery',
  );

  await handleGoogleOAuthCallback({
    requestUrl: `${siteUrl}/auth/callback?code=replayed&flow=${flowA}&next=${encodeURIComponent(returnTo)}`,
  }, {
    siteUrl,
    secret,
    now: () => issuedAt + 20_001,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    exchangeCode: async () => { exchanges += 1; },
    ensureCustomer: async () => assert.fail('callback replay must not provision'),
    claimGuestCart: async () => assert.fail('callback replay must not claim'),
    openConversation: async () => assert.fail('callback replay must not open'),
  });
  assert.equal(exchanges, 1, 'the successful OAuth code is never reused');

  const events = [];
  const retried = await retryRecoveredChatIntent({ intent: chatIntent, returnTo }, {
    secret,
    now: () => issuedAt + 20_002,
    readCookie: cookie.read,
    deleteCookie: cookie.delete,
    prepareCustomer: async () => { events.push('profile'); },
    claimGuestCart: async () => { events.push('cart'); },
    openConversation: async () => { events.push('chat'); return { status: 'sent' }; },
  });
  assert.deepEqual(retried, { status: 'sent' });
  assert.deepEqual(events, ['profile', 'cart', 'chat']);
  assert.equal(cookie.value, null);
});

test('exchange failure cannot transition or overwrite a newer tab flow', async () => {
  const { handleGoogleOAuthCallback } = requireModule(callbackFlow, 'callback-flow');
  const returnA = '/marketplace?store=a';
  const returnB = '/marketplace?store=b';
  const signedA = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowA,
    returnTo: returnA,
    intent: intent(storeA, null),
    phase: 'oauth',
  }).value;
  const signedB = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt + 1,
    flowId: flowB,
    returnTo: returnB,
    intent: intent(storeB, null),
    phase: 'oauth',
  }).value;
  const cookie = memoryCookie(signedA);
  await handleGoogleOAuthCallback({
    requestUrl: `${siteUrl}/auth/callback?code=bad&flow=${flowA}&next=${encodeURIComponent(returnA)}`,
  }, {
    siteUrl,
    secret,
    now: () => issuedAt + 20_000,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    exchangeCode: async () => { cookie.write(signedB); throw new Error('exchange_failed'); },
    ensureCustomer: async () => {},
    claimGuestCart: async () => {},
    openConversation: async () => ({ status: 'sent' }),
  });
  assert.deepEqual(
    intentCookie.inspectChatIntentCookie(cookie.value, { secret, now: issuedAt + 20_000 }).flow,
    { flowId: flowB, returnTo: returnB, intent: intent(storeB, null), phase: 'oauth' },
  );
});

test('customer failure cannot transition or overwrite a newer tab flow', async () => {
  const { handleGoogleOAuthCallback } = requireModule(callbackFlow, 'callback-flow');
  const returnA = '/marketplace?store=a';
  const returnB = '/marketplace?store=b';
  const signedA = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowA,
    returnTo: returnA,
    intent: intent(storeA, null),
    phase: 'oauth',
  }).value;
  const signedB = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt + 1,
    flowId: flowB,
    returnTo: returnB,
    intent: intent(storeB, null),
    phase: 'oauth',
  }).value;
  const cookie = memoryCookie(signedA);
  await handleGoogleOAuthCallback({
    requestUrl: `${siteUrl}/auth/callback?code=good&flow=${flowA}&next=${encodeURIComponent(returnA)}`,
  }, {
    siteUrl,
    secret,
    now: () => issuedAt + 20_000,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    exchangeCode: async () => {},
    ensureCustomer: async () => { cookie.write(signedB); throw new Error('profile_failed'); },
    claimGuestCart: async () => {},
    openConversation: async () => ({ status: 'sent' }),
  });
  assert.deepEqual(
    intentCookie.inspectChatIntentCookie(cookie.value, { secret, now: issuedAt + 20_000 }).flow,
    { flowId: flowB, returnTo: returnB, intent: intent(storeB, null), phase: 'oauth' },
  );
});

test('checkout profile recovery retries setup without an OAuth code or chat intent', async () => {
  const { handleGoogleOAuthCallback, retryRecoveredProfileFlow } = requireModule(callbackFlow, 'callback-flow');
  assert.equal(typeof retryRecoveredProfileFlow, 'function');
  const returnTo = '/marketplace/checkout';
  const signed = intentCookie.signChatIntentCookie({
    secret,
    now: issuedAt,
    flowId: flowA,
    returnTo,
    intent: null,
    phase: 'oauth',
  }).value;
  const cookie = memoryCookie(signed);
  await handleGoogleOAuthCallback({
    requestUrl: `${siteUrl}/auth/callback?code=good&flow=${flowA}&next=${encodeURIComponent(returnTo)}`,
  }, {
    siteUrl,
    secret,
    now: () => issuedAt + 20_000,
    readCookie: cookie.read,
    writeCookie: cookie.write,
    deleteCookie: cookie.delete,
    exchangeCode: async () => {},
    ensureCustomer: async () => { throw new Error('profile_failed'); },
    claimGuestCart: async () => {},
    openConversation: async () => assert.fail('checkout has no chat intent'),
  });
  const events = [];
  const result = await retryRecoveredProfileFlow({ returnTo }, {
    secret,
    now: () => issuedAt + 20_001,
    readCookie: cookie.read,
    deleteCookie: cookie.delete,
    prepareCustomer: async () => { events.push('profile'); },
    claimGuestCart: async () => { events.push('cart'); },
  });
  assert.deepEqual(result, { status: 'sent' });
  assert.deepEqual(events, ['profile', 'cart']);
  assert.equal(cookie.value, null);
});

test('anonymous checkout/chat gates and oauth-in-progress guidance are behavioral UI states', () => {
  const chat = requireModule(entryState, 'chat-entry-state');
  const checkout = requireModule(checkoutState, 'checkout-state');
  assert.deepEqual(checkout.resolveCheckoutEntryState(true), { mode: 'google' });
  assert.deepEqual(checkout.resolveCheckoutEntryState(false), { mode: 'checkout' });
  assert.equal(chat.resolveChatEntryState({ isAuthenticated: false, recovery: null }).mode, 'google');
  assert.equal(
    chat.resolveChatEntryState({ isAuthenticated: true, recovery: 'service_unavailable' }).message,
    'تعذر فتح المحادثة بعد تسجيل الدخول. أعد المحاولة من هنا؛ لن نكرر تسجيل الدخول.',
  );
  assert.deepEqual(oauthFlow.oauthInProgressFeedback(), {
    code: 'oauth_in_progress',
    message: 'هناك محاولة تسجيل دخول جارية في تبويب آخر. أكملها أو ألغها هناك، ثم أعد المحاولة هنا.',
  });
});

test('selected store surface produces a real store-level presale entry without nesting a product intent', () => {
  const { createSelectedStoreChatEntry } = requireModule(storeChat, 'store-chat');
  const model = {
    selectedStore: 'groceries',
    products: [{ id: productA, store: { id: storeA, slug: 'groceries', name: 'البقالة' } }],
  };
  const entry = createSelectedStoreChatEntry({
    model,
    returnTo: '/marketplace?store=groceries&sort=newest',
    isAuthenticated: false,
  });
  assert.deepEqual(entry.intent, { kind: 'presale', storeId: storeA, productId: null });
  assert.equal(entry.returnTo, '/marketplace?store=groceries&sort=newest');
  assert.equal(entry.isAuthenticated, false);
  assert.match(entry.loginHref, /^\/signin\?/u);
});
