import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import {
  getObjectStorageConfig,
  getSupabaseAdminSecret,
  getSupabasePublicConfig,
} from '@/lib/env/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const CHECK_TIMEOUT_MS = 4_000;
const READY_CACHE_MS = 30_000;
const NOT_READY_CACHE_MS = 5_000;
const EXPECTED_SCHEMA_VERSION = '20260905203103';
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
} as const;

type CheckName = 'database' | 'schema' | 'storage' | 'workers';
type CheckState = 'ok' | 'failed';
type ReadinessSnapshot = {
  checks: Record<CheckName, CheckState>;
  durationMs: number;
  expiresAt: number;
  ready: boolean;
};

let cachedSnapshot: ReadinessSnapshot | undefined;
let pendingProbe: Promise<ReadinessSnapshot> | undefined;

function serviceHeaders(secret: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    apikey: secret,
  };

  // Legacy service-role keys are JWTs and need the bearer header. Supabase's
  // newer sb_secret keys authenticate through apikey and must not be used as JWTs.
  if (secret.split('.').length === 3) {
    headers.Authorization = `Bearer ${secret}`;
  }
  return headers;
}

async function probeDatabase(): Promise<void> {
  const { url } = getSupabasePublicConfig();
  const secret = getSupabaseAdminSecret();
  const response = await fetch(`${url}/rest/v1/places?select=id&limit=1`, {
    cache: 'no-store',
    headers: serviceHeaders(secret),
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('database_unavailable');
}

async function probeSchemaVersion(): Promise<void> {
  const { url } = getSupabasePublicConfig();
  const secret = getSupabaseAdminSecret();
  const query = new URLSearchParams({
    select: 'value',
    key: 'eq.schema_version',
    limit: '1',
  });
  const response = await fetch(`${url}/rest/v1/marketplace_runtime_settings?${query}`, {
    cache: 'no-store',
    headers: serviceHeaders(secret),
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('schema_probe_unavailable');

  const rows = await response.json() as Array<{ value?: { version?: unknown } }>;
  if (rows[0]?.value?.version !== EXPECTED_SCHEMA_VERSION) {
    throw new Error('schema_version_mismatch');
  }
}

async function probeStorage(): Promise<void> {
  const config = getObjectStorageConfig();
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  try {
    await Promise.all(
      [...new Set([config.privateBucket, config.publicBucket])].map((bucket) => client.send(
        new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }),
        { abortSignal: AbortSignal.timeout(CHECK_TIMEOUT_MS) },
      )),
    );
  } finally {
    client.destroy();
  }
}

async function probeWorkers(): Promise<void> {
  const { url } = getSupabasePublicConfig();
  const secret = getSupabaseAdminSecret();
  const response = await fetch(`${url}/rest/v1/rpc/marketplace_release_ready`, {
    body: '{}',
    cache: 'no-store',
    headers: {
      ...serviceHeaders(secret),
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (!response.ok || await response.json() !== true) {
    throw new Error('worker_unavailable');
  }
}

async function runProbes(): Promise<ReadinessSnapshot> {
  const startedAt = Date.now();
  const results = await Promise.allSettled([
    probeDatabase(),
    probeSchemaVersion(),
    probeStorage(),
    probeWorkers(),
  ]);
  const names: CheckName[] = ['database', 'schema', 'storage', 'workers'];
  const checks = Object.fromEntries(
    results.map((result, index) => [
      names[index],
      result.status === 'fulfilled' ? 'ok' : 'failed',
    ]),
  ) as Record<CheckName, CheckState>;
  const ready = results.every((result) => result.status === 'fulfilled');
  return {
    checks,
    durationMs: Date.now() - startedAt,
    expiresAt: Date.now() + (ready ? READY_CACHE_MS : NOT_READY_CACHE_MS),
    ready,
  };
}

async function getSnapshot(): Promise<{ snapshot: ReadinessSnapshot; cached: boolean }> {
  if (cachedSnapshot && cachedSnapshot.expiresAt > Date.now()) {
    return { snapshot: cachedSnapshot, cached: true };
  }
  const sharedProbe = pendingProbe ?? runProbes();
  pendingProbe = sharedProbe;
  try {
    const snapshot = await sharedProbe;
    cachedSnapshot = snapshot;
    return { snapshot, cached: false };
  } finally {
    if (pendingProbe === sharedProbe) pendingProbe = undefined;
  }
}

export async function GET() {
  const { snapshot, cached } = await getSnapshot();

  return Response.json(
    {
      status: snapshot.ready ? 'ready' : 'not_ready',
      checks: snapshot.checks,
      schemaVersion: EXPECTED_SCHEMA_VERSION,
      release: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
      durationMs: snapshot.durationMs,
      cached,
    },
    {
      status: snapshot.ready ? 200 : 503,
      headers: NO_STORE_HEADERS,
    },
  );
}
