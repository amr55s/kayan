import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveOAuthSiteOrigin } from '../lib/auth/oauth-origin.ts';
import { startGoogleOAuthFlow } from '../lib/auth/oauth-flow.ts';
import { handleGoogleOAuthCallback } from '../lib/auth/callback-flow.ts';

const preview = {
  environment: 'preview',
  configuredSiteUrl: 'https://kayan-old-foundation.vercel.app',
  deploymentHost: 'kayan-deployment-id-team.vercel.app',
  branchHost: 'kayan-git-integration-team.vercel.app',
};
const deploymentOrigin = `https://${preview.deploymentHost}`;
const branchOrigin = `https://${preview.branchHost}`;
const secret = 'preview-origin-test-secret-at-least-32-bytes';
const flowId = 'f2616187-4f06-422c-8690-58f442023a2c';

test('Preview preserves exactly the active trusted deployment or branch origin, ignoring stale site config', () => {
  assert.equal(resolveOAuthSiteOrigin({ ...preview, requestOrigin: deploymentOrigin }), deploymentOrigin);
  assert.equal(resolveOAuthSiteOrigin({ ...preview, requestOrigin: branchOrigin }), branchOrigin);
  assert.equal(resolveOAuthSiteOrigin(preview), deploymentOrigin);
  assert.equal(resolveOAuthSiteOrigin({ ...preview, deploymentHost: undefined }), branchOrigin);
  assert.equal(resolveOAuthSiteOrigin({ ...preview, configuredSiteUrl: undefined, requestOrigin: branchOrigin }), branchOrigin);
});

test('Preview rejects arbitrary, stale, spoofed, credentialed, path, wildcard and non-HTTPS request origins', () => {
  for (const requestOrigin of [
    preview.configuredSiteUrl,
    'https://attacker.example',
    `${branchOrigin}.attacker.example`,
    `${branchOrigin}:8443`,
    `${branchOrigin}/auth/callback`,
    `${branchOrigin}?next=/onboarding`,
    `${branchOrigin}#fragment`,
    `https://user:password@${preview.branchHost}`,
    `https://${preview.branchHost}@attacker.example`,
    `https://${preview.branchHost}\\@attacker.example`,
    `http://${preview.branchHost}`,
    `https://${preview.branchHost},attacker.example`,
    ` ${branchOrigin}`,
    `${branchOrigin}\n`,
    '*.vercel.app',
    'null',
    '',
  ]) {
    assert.throws(() => resolveOAuthSiteOrigin({ ...preview, requestOrigin }), /oauth_preview_origin_untrusted/, requestOrigin);
  }
});

test('Preview requires platform hosts and never falls back to stale public site URL', () => {
  for (const host of [undefined, '', 'attacker.example', '*.vercel.app', 'https://project.vercel.app', 'project.vercel.app/path', 'user@project.vercel.app', 'project.vercel.app:443']) {
    assert.throws(() => resolveOAuthSiteOrigin({ ...preview, deploymentHost: host, branchHost: host }), /oauth_preview_origin_unconfigured/);
  }
});

test('Production and local keep configured origin and cannot be redirected by platform/request values', () => {
  for (const environment of ['production', 'development', undefined]) {
    assert.equal(resolveOAuthSiteOrigin({ ...preview, environment, configuredSiteUrl: 'https://dairtak.example/base/', requestOrigin: 'https://attacker.example' }), 'https://dairtak.example');
  }
  assert.equal(resolveOAuthSiteOrigin({ ...preview, environment: 'development', configuredSiteUrl: 'http://localhost:3000', requestOrigin: branchOrigin }), 'http://localhost:3000');
  assert.throws(() => resolveOAuthSiteOrigin({ environment: 'production', deploymentHost: preview.deploymentHost }), /site_url_missing/);
  for (const configuredSiteUrl of ['javascript:alert(1)', 'http://production.example', 'https://user:pass@production.example', 'https://production.example\\evil']) {
    assert.throws(() => resolveOAuthSiteOrigin({ environment: 'production', configuredSiteUrl }));
  }
});

test('Google round trip on either Preview origin keeps host-only state, cart and chat recovery together', async () => {
  for (const origin of [deploymentOrigin, branchOrigin]) {
    const now = Date.now();
    let cookie = null;
    let callback;
    const calls = [];
    const intent = { kind: 'presale', storeId: '4a87a29f-803b-4e0d-af3e-55d7dc54af64', productId: null };
    const next = '/marketplace?store=approved&sort=newest';
    const start = await startGoogleOAuthFlow({ next, intent }, {
      siteUrl: resolveOAuthSiteOrigin({ ...preview, requestOrigin: origin }), secret,
      now: () => now, randomFlowId: () => flowId,
      readCookie: () => cookie, writeCookie: (value) => { cookie = value; }, deleteCookie: () => { cookie = null; },
      isAuthenticated: async () => false,
      startOAuth: async (url) => { callback = new URL(url); return 'https://accounts.google.com/oauth'; },
    });
    assert.equal(start.success, true);
    assert.equal(callback.origin, origin);
    callback.searchParams.set('code', 'test-code');
    const done = await handleGoogleOAuthCallback({ requestUrl: callback.href }, {
      siteUrl: resolveOAuthSiteOrigin({ ...preview, requestOrigin: callback.origin }), secret,
      now: () => now + 1000,
      readCookie: () => cookie, writeCookie: (value) => { cookie = value; }, deleteCookie: () => { cookie = null; },
      exchangeCode: async () => { calls.push('exchange'); },
      ensureCustomer: async () => { calls.push('customer'); },
      claimGuestCart: async () => { calls.push('cart'); },
      openConversation: async () => { calls.push('chat'); return { status: 'sent' }; },
    });
    assert.equal(done.redirectTo, `${origin}${next}`);
    assert.deepEqual(calls, ['exchange', 'customer', 'cart', 'chat']);
    assert.equal(cookie, null);
  }
});

test('callback failure with missing flow remains on the selected Preview, never the old branch', async () => {
  let effects = 0;
  const result = await handleGoogleOAuthCallback({ requestUrl: `${branchOrigin}/auth/callback?error=access_denied&next=/onboarding` }, {
    siteUrl: resolveOAuthSiteOrigin({ ...preview, requestOrigin: branchOrigin }), secret,
    now: Date.now, readCookie: () => null, writeCookie: () => { effects += 1; }, deleteCookie: () => { effects += 1; },
    exchangeCode: async () => { effects += 1; }, ensureCustomer: async () => { effects += 1; },
    claimGuestCart: async () => { effects += 1; }, openConversation: async () => { effects += 1; return { status: 'sent' }; },
  });
  assert.equal(new URL(result.redirectTo).origin, branchOrigin);
  assert.equal(new URL(result.redirectTo).pathname, '/signin');
  assert.equal(effects, 0);
});

test('start, explicit switch, and callback all use the same trusted-origin resolver', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const actions = read('lib/auth/oauth-actions.ts');
  const route = read('app/auth/callback/route.ts');
  assert.match(actions, /await requestSiteOrigin\(\)/);
  assert.match(actions, /const siteUrl = await requestSiteOrigin\(\)/);
  assert.match(route, /const siteUrl = resolveOAuthSiteOrigin\(/);
  assert.doesNotMatch(actions + route, /x-forwarded-host|VERCEL_PROJECT_PRODUCTION_URL/);
});
