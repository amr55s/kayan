import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reportClientError,
  classifyClientError,
  normalizeWindowError,
  setClientErrorRelease,
} from '../lib/observability/client-errors.ts';

test('client diagnostics send only the anonymous allow-listed summary', async () => {
  let capturedBody = '';
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { pathname: '/merchant' } },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent:
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    },
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (_url, init) => {
      capturedBody = String(init?.body ?? '');
      return new Response(null, { status: 202 });
    },
  });

  setClientErrorRelease('preview sha with spaces');
  await reportClientError(
    new Error('SECRET phone 01012345678 https://private.example/form'),
    'react_boundary',
  );

  const payload = JSON.parse(capturedBody);
  assert.deepEqual(Object.keys(payload).sort(), [
    'browserFamily',
    'errorKind',
    'eventType',
    'fingerprint',
    'osFamily',
    'release',
    'route',
  ]);
  assert.equal(payload.route, '/merchant');
  assert.equal(payload.browserFamily, 'Chrome');
  assert.equal(payload.osFamily, 'Android');
  assert.equal(payload.release, 'previewshawithspaces');
  assert.equal(payload.errorKind, 'Unknown');
  assert.match(payload.fingerprint, /^[a-f0-9]{16,32}$/);
  assert.doesNotMatch(capturedBody, /01012345678|private\.example|SECRET/);
});

test('client diagnostics classify safe error categories without leaking messages', () => {
  assert.equal(
    classifyClientError(new Error('Minified React error #418; secret details')),
    'ReactError',
  );
  assert.equal(
    classifyClientError(new TypeError('Failed to fetch private URL')),
    'NetworkError',
  );
  assert.equal(
    classifyClientError(Object.assign(new Error('Loading chunk 123 failed'), {
      name: 'ChunkLoadError',
    })),
    'ChunkLoadError',
  );
});

test('generic cross-origin window errors are ignored', () => {
  assert.equal(normalizeWindowError({ error: null, message: 'Script error.' }), null);
  assert.equal(normalizeWindowError({ error: null, message: '' }), null);
  assert.ok(
    normalizeWindowError({ error: new TypeError('render failed'), message: 'render failed' })
      instanceof Error,
  );
});

test('diagnostic transport failure remains silent', async () => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { pathname: '/directory' } },
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => {
      throw new Error('offline');
    },
  });

  await assert.doesNotReject(
    reportClientError(new Error('network failed'), 'window_error'),
  );
});
