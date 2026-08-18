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

export type DigitalOceanSpacesConfig = {
  accessKeyId: string;
  bucket: string;
  cdnBaseUrl: string;
  endpoint: string;
  region: string;
  secretAccessKey: string;
};

export function getDigitalOceanSpacesConfig(): DigitalOceanSpacesConfig {
  return {
    accessKeyId: requireServerEnv('DO_SPACES_ACCESS_KEY_ID'),
    bucket: requireServerEnv('DO_SPACES_BUCKET'),
    cdnBaseUrl: requireHttpsUrl('DO_SPACES_CDN_BASE_URL'),
    endpoint: requireHttpsUrl('DO_SPACES_ENDPOINT'),
    region: requireServerEnv('DO_SPACES_REGION'),
    secretAccessKey: requireServerEnv('DO_SPACES_SECRET_ACCESS_KEY'),
  };
}
