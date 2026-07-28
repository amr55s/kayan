import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reportClientError,
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
  assert.match(payload.fingerprint, /^[a-f0-9]{16,32}$/);
  assert.doesNotMatch(capturedBody, /01012345678|private\.example|SECRET/);
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
