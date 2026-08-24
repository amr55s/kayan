import 'server-only';

export function requireServerEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

export function requireOneServerEnv(names: readonly string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing one of the required server environment variables: ${names.join(', ')}`);
}

function requireHttpsUrl(name: string): string {
  const raw = requireServerEnv(name);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS.`);
  return url.toString().replace(/\/$/u, '');
}

export function getSupabasePublicConfig() {
  return {
    url: requireHttpsUrl('NEXT_PUBLIC_SUPABASE_URL'),
    publishableKey: requireOneServerEnv([
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ]),
  } as const;
}

export function getSupabaseAdminSecret() {
  return requireOneServerEnv(['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
}

export type ObjectStorageConfig = {
  accessKeyId: string;
  cdnBaseUrl: string;
  endpoint: string;
  privateBucket: string;
  forcePathStyle: boolean;
  provider: 'cloudflare-r2' | 'digitalocean-spaces' | 'supabase-storage';
  publicBucket: string;
  region: string;
  secretAccessKey: string;
  supportsObjectAcl: boolean;
};

export function getObjectStorageConfig(): ObjectStorageConfig {
  const endpoint = requireHttpsUrl(process.env.OBJECT_STORAGE_ENDPOINT?.trim()
    ? 'OBJECT_STORAGE_ENDPOINT'
    : 'DO_SPACES_ENDPOINT');
  const hostname = new URL(endpoint).hostname;
  const isR2Endpoint = hostname.endsWith('.r2.cloudflarestorage.com');
  const isSpacesEndpoint = hostname.endsWith('.digitaloceanspaces.com');
  const isSupabaseStorageEndpoint = hostname.endsWith('.storage.supabase.co')
    && new URL(endpoint).pathname === '/storage/v1/s3';
  if (!isR2Endpoint && !isSpacesEndpoint && !isSupabaseStorageEndpoint) {
    throw new Error('Object storage endpoint must use Cloudflare R2, DigitalOcean Spaces, or Supabase Storage.');
  }
  const inferredProvider = isR2Endpoint
    ? 'cloudflare-r2'
    : isSpacesEndpoint
      ? 'digitalocean-spaces'
      : 'supabase-storage';
  const provider = process.env.OBJECT_STORAGE_PROVIDER?.trim() || inferredProvider;
  if (!['cloudflare-r2', 'digitalocean-spaces', 'supabase-storage'].includes(provider)) {
    throw new Error('OBJECT_STORAGE_PROVIDER must be cloudflare-r2, digitalocean-spaces, or supabase-storage.');
  }
  if (provider !== inferredProvider) {
    throw new Error('OBJECT_STORAGE_PROVIDER does not match OBJECT_STORAGE_ENDPOINT.');
  }
  const privateBucket = requireOneServerEnv([
    'OBJECT_STORAGE_PRIVATE_BUCKET',
    'OBJECT_STORAGE_BUCKET',
    'DO_SPACES_BUCKET',
  ]);
  const publicBucket = requireOneServerEnv([
    'OBJECT_STORAGE_PUBLIC_BUCKET',
    'OBJECT_STORAGE_BUCKET',
    'DO_SPACES_BUCKET',
  ]);
  if (provider !== 'digitalocean-spaces' && privateBucket === publicBucket) {
    throw new Error('This object storage provider requires separate private and public buckets.');
  }

  return {
    accessKeyId: requireOneServerEnv(['OBJECT_STORAGE_ACCESS_KEY_ID', 'DO_SPACES_ACCESS_KEY_ID']),
    cdnBaseUrl: requireHttpsUrl(process.env.OBJECT_STORAGE_PUBLIC_BASE_URL?.trim()
      ? 'OBJECT_STORAGE_PUBLIC_BASE_URL'
      : 'DO_SPACES_CDN_BASE_URL'),
    endpoint,
    forcePathStyle: provider === 'supabase-storage',
    privateBucket,
    provider,
    publicBucket,
    region: requireOneServerEnv(['OBJECT_STORAGE_REGION', 'DO_SPACES_REGION']),
    secretAccessKey: requireOneServerEnv(['OBJECT_STORAGE_SECRET_ACCESS_KEY', 'DO_SPACES_SECRET_ACCESS_KEY']),
    supportsObjectAcl: provider === 'digitalocean-spaces',
  };
}
