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
    'OBJECT_STORAGE_SECRET_ACCESS_KEY',
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
  assert.match(source, /OBJECT_STORAGE_SECRET_ACCESS_KEY', 'DO_SPACES_SECRET_ACCESS_KEY'[\s\S]*32/);
  assert.match(source, /Cloudflare R2 requires OBJECT_STORAGE_REGION=auto/);
  assert.match(source, /OBJECT_STORAGE_PROVIDER does not match the configured endpoint/);
  assert.match(source, /CRON_SECRET', 32/);
  assert.match(source, /Turnstile public and secret keys must be different/);
  assert.match(source, /must not contain URL credentials/);
  assert.match(source, /groupName === 'observability'/);
  assert.match(source, /validateOptionalLength\('SENTRY_AUTH_TOKEN', 20\)/);
});

test('storage runtime supports R2 without sending its unsupported ACL header', () => {
  const env = read('lib/env/server.ts');
  const storage = read('lib/media/spaces.ts');
  const config = read('next.config.ts');
  assert.match(env, /cloudflare-r2/);
  assert.match(env, /digitalocean-spaces/);
  assert.match(env, /supabase-storage/);
  assert.match(storage, /forcePathStyle: config\.forcePathStyle/);
  assert.match(storage, /config\.supportsObjectAcl\s*\?\s*\{ ACL: 'public-read'/);
  assert.match(storage, /config\.supportsObjectAcl\s*\?\s*\{ ACL: 'private'/);
  assert.match(config, /https:\/\/\*\.r2\.cloudflarestorage\.com/);
});

test('runtime preflight accepts Supabase S3 storage on the existing free project', () => {
  const result = runPreflight({
    OBJECT_STORAGE_PROVIDER: 'supabase-storage',
    OBJECT_STORAGE_REGION: 'eu-west-1',
    OBJECT_STORAGE_ENDPOINT: 'https://staging.storage.supabase.co/storage/v1/s3',
    OBJECT_STORAGE_PRIVATE_BUCKET: 'marketplace-media-private',
    OBJECT_STORAGE_PUBLIC_BUCKET: 'marketplace-media-public',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'r'.repeat(32),
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 's'.repeat(64),
    OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://staging.supabase.co/storage/v1/object/public/marketplace-media-public',
  });
  assert.equal(result.status, 0, result.stderr);
});

const baseRuntimeEnv = {
  NEXT_PUBLIC_SITE_URL: 'https://preview.example.com',
  NEXT_PUBLIC_SUPABASE_URL: 'https://staging.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  SUPABASE_SECRET_KEY: `sb_secret_${'a'.repeat(32)}`,
  CLIENT_ERROR_HASH_SALT: 'a'.repeat(32),
  CRON_SECRET: 'b'.repeat(32),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'turnstile_public_key_1234',
  TURNSTILE_SECRET_KEY: 'turnstile_secret_key_5678',
  MARKETPLACE_CHAT_INTENT_SECRET: 'e'.repeat(32),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'c'.repeat(64),
  VAPID_PRIVATE_KEY: 'd'.repeat(32),
  VAPID_SUBJECT: 'mailto:ops@example.com',
};

function runPreflight(storage) {
  return spawnSync(process.execPath, ['scripts/check-env.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      ...baseRuntimeEnv,
      ...storage,
    },
  });
}

test('runtime preflight refuses a missing or weak chat-intent signing secret', () => {
  const storage = {
    OBJECT_STORAGE_PROVIDER: 'cloudflare-r2',
    OBJECT_STORAGE_REGION: 'auto',
    OBJECT_STORAGE_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
    OBJECT_STORAGE_PRIVATE_BUCKET: 'dairtak-staging-private',
    OBJECT_STORAGE_PUBLIC_BUCKET: 'dairtak-staging-public',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'r'.repeat(32),
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 's'.repeat(64),
    OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://media.example.com',
  };
  const missing = runPreflight({ ...storage, MARKETPLACE_CHAT_INTENT_SECRET: undefined });
  const weak = runPreflight({ ...storage, MARKETPLACE_CHAT_INTENT_SECRET: 'too-short' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /MARKETPLACE_CHAT_INTENT_SECRET/);
  assert.notEqual(weak.status, 0);
  assert.match(weak.stderr, /at least 32/);
});

test('runtime preflight accepts Cloudflare R2 without requiring Sentry', () => {
  const result = runPreflight({
    OBJECT_STORAGE_PROVIDER: 'cloudflare-r2',
    OBJECT_STORAGE_REGION: 'auto',
    OBJECT_STORAGE_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
    OBJECT_STORAGE_PRIVATE_BUCKET: 'dairtak-staging-private',
    OBJECT_STORAGE_PUBLIC_BUCKET: 'dairtak-staging-public',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'r'.repeat(32),
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 's'.repeat(64),
    OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://media.example.com',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('runtime preflight preserves legacy DigitalOcean Spaces configuration', () => {
  const result = runPreflight({
    DO_SPACES_REGION: 'fra1',
    DO_SPACES_ENDPOINT: 'https://fra1.digitaloceanspaces.com',
    DO_SPACES_BUCKET: 'tawla',
    DO_SPACES_ACCESS_KEY_ID: 'd'.repeat(20),
    DO_SPACES_SECRET_ACCESS_KEY: 's'.repeat(48),
    DO_SPACES_CDN_BASE_URL: 'https://tawla.fra1.cdn.digitaloceanspaces.com',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('runtime preflight rejects a provider and endpoint mismatch', () => {
  const result = runPreflight({
    OBJECT_STORAGE_PROVIDER: 'digitalocean-spaces',
    OBJECT_STORAGE_REGION: 'auto',
    OBJECT_STORAGE_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
    OBJECT_STORAGE_PRIVATE_BUCKET: 'dairtak-staging-private',
    OBJECT_STORAGE_PUBLIC_BUCKET: 'dairtak-staging-public',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'r'.repeat(32),
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 's'.repeat(64),
    OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://media.example.com',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OBJECT_STORAGE_PROVIDER does not match/);
});

test('runtime preflight refuses one public R2 bucket for private staging data', () => {
  const result = runPreflight({
    OBJECT_STORAGE_PROVIDER: 'cloudflare-r2',
    OBJECT_STORAGE_REGION: 'auto',
    OBJECT_STORAGE_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
    OBJECT_STORAGE_PRIVATE_BUCKET: 'dairtak-staging',
    OBJECT_STORAGE_PUBLIC_BUCKET: 'dairtak-staging',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'r'.repeat(32),
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 's'.repeat(64),
    OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://media.example.com',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires separate private and public buckets/);
});
