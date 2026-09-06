import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
function load(relative, dependencies, fetcher = fetch) {
  const output = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  Function('require', 'module', 'exports', 'fetch', output)(
    key => Object.hasOwn(dependencies, key) ? dependencies[key] : nativeRequire(key), loaded, loaded.exports, fetcher,
  );
  return loaded.exports;
}

function provider(fetcher) {
  return load('../lib/auth/google-provider.ts', {
    'server-only': {},
    '@/lib/env/server': { getSupabasePublicConfig: () => ({ url: 'https://project.supabase.co', publishableKey: 'public-test-key' }) },
  }, fetcher);
}

test('provider probe uses only public settings, no cache, no redirects and a bounded abort signal', async () => {
  let request;
  const helper = provider(async (url, options) => {
    request = { url, options };
    return Response.json({ external: { google: true } });
  });
  assert.equal(await helper.checkGoogleProviderAvailability(), 'enabled');
  assert.equal(request.url.href, 'https://project.supabase.co/auth/v1/settings');
  assert.deepEqual(request.options.headers, { apikey: 'public-test-key' });
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.redirect, 'error');
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.match(readFileSync(new URL('../lib/auth/google-provider.ts', import.meta.url), 'utf8'), /AbortSignal.timeout\(4_000\)/);
});

test('only an explicit boolean enables Google; malformed and unknown settings fail closed', async () => {
  for (const [body, expected] of [
    [{ external: { google: false } }, 'disabled'],
    [{}, 'unavailable'], [null, 'unavailable'],
    [{ external: null }, 'unavailable'], [{ external: { google: 'true' } }, 'unavailable'],
    [{ external: { google: 1 } }, 'unavailable'],
  ]) {
    assert.equal(await provider(async () => Response.json(body)).checkGoogleProviderAvailability(), expected);
  }
});

test('network, timeout, HTTP errors and invalid JSON never count as an enabled provider', async () => {
  for (const fetcher of [
    async () => { throw new Error('network'); },
    async () => { throw new DOMException('timeout', 'TimeoutError'); },
    async () => new Response('unavailable', { status: 503 }),
    async () => new Response('<html>unexpected</html>'),
  ]) {
    assert.equal(await provider(fetcher).checkGoogleProviderAvailability(), 'unavailable');
  }
});

function actions({ availability = 'disabled', google = false, anonymous = false } = {}) {
  const events = [];
  let user = anonymous ? null : { id: 'existing-user', identities: [{ provider: google ? 'google' : 'email' }] };
  const helper = provider(async () => Response.json({ external: { google: false } }));
  const client = { auth: {
    getUser: async () => ({ data: { user }, error: null }),
    signOut: async options => { events.push(['signout', options]); user = null; return { error: null }; },
  } };
  const loaded = load('../lib/auth/oauth-actions.ts', {
    'next/headers': {
      headers: async () => new Headers({ origin: 'https://preview.vercel.app' }),
      cookies: async () => { events.push(['cookies']); return {}; },
    },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/auth/safe-next': { safeNextPath: value => value },
    '@/lib/auth/chat-intent-cookie': { chatIntentCookie: { name: 'test' } },
    '@/lib/auth/oauth-origin': { resolveOAuthSiteOrigin: () => 'https://preview.vercel.app' },
    '@/lib/auth/google-provider': {
      googleProviderFeedback: helper.googleProviderFeedback,
      checkGoogleProviderAvailability: async () => { events.push(['probe']); return availability; },
    },
    '@/lib/observability/server-log': { logSafeServerFailure: () => {} },
    '@/lib/auth/oauth-flow': { startGoogleOAuthFlow: async () => { events.push(['oauth']); return { success: true, url: 'https://accounts.google.com/test' }; } },
  });
  return { ...loaded, events };
}

async function configured(task) {
  const previous = process.env.MARKETPLACE_CHAT_INTENT_SECRET;
  process.env.MARKETPLACE_CHAT_INTENT_SECRET = 'provider-test-secret-at-least-32-characters';
  try { await task(); } finally {
    if (previous === undefined) delete process.env.MARKETPLACE_CHAT_INTENT_SECRET;
    else process.env.MARKETPLACE_CHAT_INTENT_SECRET = previous;
  }
}

test('disabled or unavailable Google leaves legacy session and all OAuth cookies untouched', () => configured(async () => {
  for (const availability of ['disabled', 'unavailable']) {
    const action = actions({ availability });
    const result = await action.switchToGoogleForOnboarding();
    assert.equal(result.success, false);
    assert.equal(result.code, 'start_failed');
    assert.match(result.message, availability === 'disabled' ? /غير مفعّل/ : /تعذر التحقق/);
    assert.deepEqual(action.events, [['probe']]);
  }
}));

test('anonymous Google start rejects disabled provider before PKCE/cookie work and redirect generation', async () => {
  const action = actions({ anonymous: true });
  const result = await action.beginGoogleSignIn('/onboarding');
  assert.equal(result.success, false);
  assert.deepEqual(action.events, [['probe']]);
});

test('enabled provider is checked before explicit legacy logout and OAuth starts afterward', () => configured(async () => {
  const action = actions({ availability: 'enabled' });
  const result = await action.switchToGoogleForOnboarding();
  assert.equal(result.success, true);
  assert.deepEqual(action.events, [['probe'], ['signout', { scope: 'local' }], ['probe'], ['cookies'], ['oauth']]);
}));

test('existing sessions continue without provider availability, and Google switching does not log out', () => configured(async () => {
  const legacy = actions();
  assert.deepEqual(await legacy.beginGoogleSignIn('/marketplace/cart'), { success: true, url: '/marketplace/cart' });
  assert.deepEqual(legacy.events, []);
  const google = actions({ google: true });
  assert.deepEqual(await google.switchToGoogleForOnboarding(), { success: true, url: '/onboarding' });
  assert.deepEqual(google.events, []);
}));
