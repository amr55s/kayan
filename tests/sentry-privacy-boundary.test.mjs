import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('all Sentry runtimes install the shared privacy scrubber', async () => {
  const files = await Promise.all([
    'instrumentation-client.ts',
    'sentry.server.config.ts',
    'sentry.edge.config.ts',
  ].map((file) => readFile(new URL(file, root), 'utf8')));

  for (const source of files) {
    assert.match(source, /beforeSend:\s*scrubSentryEvent/u);
    assert.match(source, /sendDefaultPii:\s*false/u);
  }
});

test('the scrubber removes request payloads, credentials and user data', async () => {
  const source = await readFile(new URL('lib/observability/sentry-scrub.ts', root), 'utf8');
  assert.match(source, /event\.user = undefined/u);
  assert.match(source, /event\.extra = undefined/u);
  assert.match(source, /request\.cookies = undefined/u);
  assert.match(source, /request\.data = undefined/u);
  assert.match(source, /request\.headers = undefined/u);
  assert.match(source, /request\.query_string = undefined/u);
  assert.match(source, /redacted-phone/u);
  assert.match(source, /redacted-email/u);
  assert.match(source, /redacted-token/u);
});
