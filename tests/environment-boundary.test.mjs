import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('the deployment contract includes storage, abuse protection, push, and observability', () => {
  const result = spawnSync(process.execPath, ['scripts/check-env.mjs', '--contract'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);

  const example = read('.env.example');
  for (const name of [
    'DO_SPACES_SECRET_ACCESS_KEY',
    'TURNSTILE_SECRET_KEY',
    'VAPID_PRIVATE_KEY',
    'SENTRY_AUTH_TOKEN',
  ]) {
    assert.match(example, new RegExp(`^${name}=`, 'm'));
  }
});

test('environment preflight rejects public secrets and weak deployment credentials', () => {
  const source = read('scripts/check-env.mjs');
  assert.match(source, /key\.startsWith\('NEXT_PUBLIC_'\)/);
  assert.match(source, /DO_SPACES_SECRET_ACCESS_KEY', 32/);
  assert.match(source, /CRON_SECRET', 32/);
  assert.match(source, /Turnstile public and secret keys must be different/);
  assert.match(source, /must not contain URL credentials/);
});
