import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractOnly = process.argv.includes('--contract');

const groups = {
  core: [
    'NEXT_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
    'CLIENT_ERROR_HASH_SALT',
  ],
  media: [
    ['OBJECT_STORAGE_REGION', 'DO_SPACES_REGION'],
    ['OBJECT_STORAGE_ENDPOINT', 'DO_SPACES_ENDPOINT'],
    ['OBJECT_STORAGE_PRIVATE_BUCKET', 'OBJECT_STORAGE_BUCKET', 'DO_SPACES_BUCKET'],
    ['OBJECT_STORAGE_PUBLIC_BUCKET', 'OBJECT_STORAGE_BUCKET', 'DO_SPACES_BUCKET'],
    ['OBJECT_STORAGE_ACCESS_KEY_ID', 'DO_SPACES_ACCESS_KEY_ID'],
    ['OBJECT_STORAGE_SECRET_ACCESS_KEY', 'DO_SPACES_SECRET_ACCESS_KEY'],
    ['OBJECT_STORAGE_PUBLIC_BASE_URL', 'DO_SPACES_CDN_BASE_URL'],
  ],
  operations: [
    'CRON_SECRET',
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    'TURNSTILE_SECRET_KEY',
  ],
  notifications: [
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_SUBJECT',
  ],
  observability: [
    'NEXT_PUBLIC_SENTRY_DSN',
    'SENTRY_AUTH_TOKEN',
    'SENTRY_ORG',
    'SENTRY_PROJECT',
  ],
};

const allRequirements = Object.values(groups).flat();

function label(requirement) {
  return Array.isArray(requirement) ? requirement.join(' or ') : requirement;
}

function hasValue(requirement, source) {
  const keys = Array.isArray(requirement) ? requirement : [requirement];
  return keys.some((key) => typeof source[key] === 'string' && source[key].trim().length > 0);
}

function resolvedValue(requirement, source = process.env) {
  const keys = Array.isArray(requirement) ? requirement : [requirement];
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function parseExample(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equals = line.indexOf('=');
    if (equals < 1) continue;
    values[line.slice(0, equals).trim()] = line.slice(equals + 1).trim();
  }
  return values;
}

function validateUrl(name, raw, {
  httpsOnly = true,
  originOnly = false,
  allowCredentials = false,
} = {}) {
  if (!raw) return;
  let value;
  try {
    value = new URL(raw);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
  if (httpsOnly && value.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS.`);
  }
  if (!allowCredentials && (value.username || value.password)) {
    throw new Error(`${name} must not contain URL credentials.`);
  }
  if (originOnly && (value.pathname !== '/' || value.search || value.hash)) {
    throw new Error(`${name} must be an origin without a path, query, or fragment.`);
  }
  return value;
}

function requireLength(requirement, minimum) {
  if ((resolvedValue(requirement)?.length ?? 0) < minimum) {
    throw new Error(`${label(requirement)} must contain at least ${minimum} characters.`);
  }
}

function validateOptionalLength(name, minimum) {
  const value = process.env[name]?.trim();
  if (value && value.length < minimum) {
    throw new Error(`${name} must contain at least ${minimum} characters when configured.`);
  }
}

async function checkContract() {
  const values = parseExample(await readFile(path.join(root, '.env.example'), 'utf8'));
  const missing = allRequirements.filter((requirement) => {
    const keys = Array.isArray(requirement) ? requirement : [requirement];
    return !keys.some((key) => Object.hasOwn(values, key));
  });
  if (missing.length) {
    throw new Error(`.env.example is missing: ${missing.map(label).join(', ')}`);
  }

  const exposedSecrets = Object.keys(values).filter(
    (key) => key.startsWith('NEXT_PUBLIC_') && /(SECRET|SERVICE_ROLE|PRIVATE|AUTH_TOKEN|ACCESS_KEY)/u.test(key),
  );
  if (exposedSecrets.length) {
    throw new Error(`Server secrets must not be public: ${exposedSecrets.join(', ')}`);
  }
  console.log('Environment contract is complete and keeps server credentials private.');
}

function checkRuntime() {
  const missing = [];
  for (const [groupName, requirements] of Object.entries(groups)) {
    if (groupName === 'observability') continue;
    const groupMissing = requirements.filter((requirement) => !hasValue(requirement, process.env));
    if (groupMissing.length) {
      missing.push(`${groupName}: ${groupMissing.map(label).join(', ')}`);
    }
  }
  if (missing.length) {
    throw new Error(`Deployment environment is incomplete. ${missing.join(' | ')}`);
  }

  validateUrl('NEXT_PUBLIC_SITE_URL', process.env.NEXT_PUBLIC_SITE_URL, { originOnly: true });
  validateUrl('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL, { originOnly: true });
  const storageEndpointRaw = resolvedValue(['OBJECT_STORAGE_ENDPOINT', 'DO_SPACES_ENDPOINT']);
  const storagePublicBaseRaw = resolvedValue(['OBJECT_STORAGE_PUBLIC_BASE_URL', 'DO_SPACES_CDN_BASE_URL']);
  const storageEndpoint = validateUrl('object storage endpoint', storageEndpointRaw);
  validateUrl('object storage public base URL', storagePublicBaseRaw);
  validateUrl('NEXT_PUBLIC_SENTRY_DSN', process.env.NEXT_PUBLIC_SENTRY_DSN, { allowCredentials: true });
  const vapidSubject = validateUrl('VAPID_SUBJECT', process.env.VAPID_SUBJECT, { httpsOnly: false });

  const inferredStorageProvider = storageEndpoint?.hostname.endsWith('.r2.cloudflarestorage.com')
    ? 'cloudflare-r2'
    : storageEndpoint?.hostname.endsWith('.digitaloceanspaces.com')
      ? 'digitalocean-spaces'
      : storageEndpoint?.hostname.endsWith('.storage.supabase.co')
        && storageEndpoint.pathname === '/storage/v1/s3'
        ? 'supabase-storage'
        : undefined;
  const configuredStorageProvider = process.env.OBJECT_STORAGE_PROVIDER?.trim();
  if (!inferredStorageProvider) {
    throw new Error('Object storage endpoint must use Cloudflare R2, DigitalOcean Spaces, or Supabase Storage.');
  }
  if (configuredStorageProvider && configuredStorageProvider !== inferredStorageProvider) {
    throw new Error('OBJECT_STORAGE_PROVIDER does not match the configured endpoint.');
  }
  const privateBucket = resolvedValue(['OBJECT_STORAGE_PRIVATE_BUCKET', 'OBJECT_STORAGE_BUCKET', 'DO_SPACES_BUCKET']);
  const publicBucket = resolvedValue(['OBJECT_STORAGE_PUBLIC_BUCKET', 'OBJECT_STORAGE_BUCKET', 'DO_SPACES_BUCKET']);
  for (const bucket of [privateBucket, publicBucket]) {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(bucket ?? '')) {
      throw new Error('Object storage bucket is not a valid bucket name.');
    }
  }
  if (inferredStorageProvider !== 'digitalocean-spaces' && privateBucket === publicBucket) {
    throw new Error('This object storage provider requires separate private and public buckets.');
  }
  const storageRegion = resolvedValue(['OBJECT_STORAGE_REGION', 'DO_SPACES_REGION']);
  if (inferredStorageProvider === 'cloudflare-r2' && storageRegion !== 'auto') {
    throw new Error('Cloudflare R2 requires OBJECT_STORAGE_REGION=auto.');
  }
  if (inferredStorageProvider === 'digitalocean-spaces' && !/^[a-z]{2,5}\d(?:-\d)?$/u.test(storageRegion ?? '')) {
    throw new Error('DigitalOcean Spaces region is invalid.');
  }
  if (!vapidSubject || !['https:', 'mailto:'].includes(vapidSubject.protocol)) {
    throw new Error('VAPID_SUBJECT must use https: or mailto:.');
  }

  for (const [name, minimum] of [
    ['CLIENT_ERROR_HASH_SALT', 32],
    ['CRON_SECRET', 32],
    [['OBJECT_STORAGE_ACCESS_KEY_ID', 'DO_SPACES_ACCESS_KEY_ID'], 16],
    [['OBJECT_STORAGE_SECRET_ACCESS_KEY', 'DO_SPACES_SECRET_ACCESS_KEY'], 32],
    ['NEXT_PUBLIC_TURNSTILE_SITE_KEY', 20],
    ['TURNSTILE_SECRET_KEY', 20],
    ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 40],
    ['VAPID_PRIVATE_KEY', 20],
  ]) {
    requireLength(name, minimum);
  }
  validateOptionalLength('SENTRY_AUTH_TOKEN', 20);
  if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY === process.env.TURNSTILE_SECRET_KEY) {
    throw new Error('Turnstile public and secret keys must be different.');
  }
  console.log('Deployment environment preflight passed.');
}

try {
  if (contractOnly) await checkContract();
  else checkRuntime();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
