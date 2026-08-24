import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const APPLY_CONFIRMATION = 'legacy-media-backfill';
const SOURCE_MAX_BYTES = 12 * 1024 * 1024;
const OUTPUT_MAX_BYTES = 3_670_016;
const PAGE_SIZE = 100;
const REPORT_PATH = resolve('.artifacts', 'legacy-media-backfill-report.json');
const SAFE_CODE = /^[a-z][a-z0-9_.-]{1,79}$/u;
let activeRunId = null;

function parseIntegerFlag(name, fallback, maximum) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`invalid_${name.replaceAll('-', '_')}`);
  }
  return parsed;
}

function parseOptions() {
  const args = process.argv.slice(2);
  const known = /^(--apply|--confirm-apply=legacy-media-backfill|--run-id=[0-9a-f-]+|--concurrency=\d+|--batch-size=\d+|--max-items=\d+)$/u;
  if (args.some((arg) => !known.test(arg))) throw new Error('unknown_argument');
  const apply = args.includes('--apply');
  const confirmation = args.find((arg) => arg.startsWith('--confirm-apply='))?.split('=')[1];
  if (apply && confirmation !== APPLY_CONFIRMATION) throw new Error('apply_confirmation_required');
  if (!apply && confirmation) throw new Error('confirmation_without_apply');
  const runId = args.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length);
  if (runId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(runId)) {
    throw new Error('invalid_run_id');
  }
  return {
    apply,
    batchSize: parseIntegerFlag('batch-size', 10, 25),
    concurrency: parseIntegerFlag('concurrency', 3, 4),
    maxItems: parseIntegerFlag('max-items', 250, 2_000),
    runId,
  };
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function requireOneEnv(names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`missing_${names.join('_or_').toLowerCase()}`);
}

function getServiceKey() {
  return process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || (() => { throw new Error('missing_supabase_service_key'); })();
}

function safeCode(error) {
  const candidates = error && typeof error === 'object'
    ? [error.code, error.message, error.name]
    : [error];
  const code = candidates.find((candidate) => typeof candidate === 'string' && SAFE_CODE.test(candidate));
  return typeof code === 'string' ? code.toLowerCase() : 'unknown_error';
}

function log(event, values = {}) {
  const payload = { event };
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) payload[key] = value;
    if (typeof value === 'boolean') payload[key] = value;
  }
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function writeReport(report) {
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  const temporaryPath = `${REPORT_PATH}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryPath, REPORT_PATH);
}

function encodeObjectKey(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

export function parseLegacySource(sourceUrl, sourceOrigin, expectedBucket) {
  let url;
  try { url = new URL(sourceUrl); } catch { return null; }
  if (url.origin !== sourceOrigin || url.search || url.hash) return null;
  const prefix = `/storage/v1/object/public/${expectedBucket}/`;
  if (!url.pathname.startsWith(prefix)) return null;
  const encodedKey = url.pathname.slice(prefix.length);
  let key;
  try { key = encodedKey.split('/').map(decodeURIComponent).join('/'); } catch { return null; }
  if (!key || key.length > 1024 || key.startsWith('/') || key.split('/').includes('..')) return null;
  return { bucket: expectedBucket, key };
}

async function rpc(supabase, name, parameters) {
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) {
    const wrapped = new Error(name);
    wrapped.code = typeof error.code === 'string' ? error.code : 'rpc_failed';
    throw wrapped;
  }
  return data;
}

function asRun(value) {
  const run = Array.isArray(value) ? value[0] : value;
  if (!run || typeof run !== 'object' || typeof run.status !== 'string') {
    throw new Error('invalid_backfill_run_response');
  }
  return run;
}

function toCandidate(targetKind, entityId, ordinal, sourceUrl, source) {
  return {
    targetKind,
    entityId,
    ordinal: ordinal ?? null,
    sourceUrl,
    sourceBucket: source.bucket,
    sourceObjectKey: source.key,
  };
}

async function scanPlaces({ apply, checkpoint, sourceOrigin, supabase, runId, summary }) {
  let cursor = checkpoint || null;
  for (;;) {
    let query = supabase.from('places').select('id,images').order('id', { ascending: true }).limit(PAGE_SIZE);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error) throw Object.assign(new Error('places_scan_failed'), { code: error.code });
    const rows = data || [];
    const candidates = [];
    for (const row of rows) {
      const images = Array.isArray(row.images) ? row.images : [];
      images.slice(0, 15).forEach((sourceUrl, index) => {
        if (typeof sourceUrl !== 'string') return;
        const source = parseLegacySource(sourceUrl, sourceOrigin, 'listing-images');
        if (source) candidates.push(toCandidate('place_image', row.id, index + 1, sourceUrl, source));
        else if (sourceUrl.includes('/storage/v1/object/')) summary.invalid += 1;
      });
    }
    summary.placeImages += candidates.length;
    if (apply && candidates.length) {
      for (let start = 0; start < candidates.length; start += 100) {
        await rpc(supabase, 'enqueue_legacy_media_backfill_items', {
          p_run_id: runId,
          p_items: candidates.slice(start, start + 100),
        });
      }
    }
    cursor = rows.at(-1)?.id || cursor;
    if (apply) await rpc(supabase, 'checkpoint_legacy_media_backfill_discovery', {
      p_run_id: runId,
      p_stream: 'places',
      p_checkpoint: cursor,
      p_complete: rows.length < PAGE_SIZE,
    });
    if (rows.length < PAGE_SIZE) break;
  }
}

async function scanDrivers({ apply, checkpoint, sourceOrigin, supabase, runId, summary }) {
  let cursor = checkpoint || null;
  for (;;) {
    let query = supabase.from('driver_profiles').select('profile_id,avatar_url').order('profile_id', { ascending: true }).limit(PAGE_SIZE);
    if (cursor) query = query.gt('profile_id', cursor);
    const { data, error } = await query;
    if (error) throw Object.assign(new Error('drivers_scan_failed'), { code: error.code });
    const rows = data || [];
    const candidates = [];
    for (const row of rows) {
      if (typeof row.avatar_url !== 'string') continue;
      const source = parseLegacySource(row.avatar_url, sourceOrigin, 'driver-avatars');
      if (source) candidates.push(toCandidate('driver_avatar', row.profile_id, null, row.avatar_url, source));
      else if (row.avatar_url.includes('/storage/v1/object/')) summary.invalid += 1;
    }
    summary.driverAvatars += candidates.length;
    if (apply && candidates.length) await rpc(supabase, 'enqueue_legacy_media_backfill_items', {
      p_run_id: runId,
      p_items: candidates,
    });
    cursor = rows.at(-1)?.profile_id || cursor;
    if (apply) await rpc(supabase, 'checkpoint_legacy_media_backfill_discovery', {
      p_run_id: runId,
      p_stream: 'drivers',
      p_checkpoint: cursor,
      p_complete: rows.length < PAGE_SIZE,
    });
    if (rows.length < PAGE_SIZE) break;
  }
}

export function assertMagic(buffer) {
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!jpeg && !png && !webp) throw Object.assign(new Error('unsupported_image_magic'), { retryable: false });
}

async function downloadSource(item, sourceOrigin, serviceKey) {
  const url = `${sourceOrigin}/storage/v1/object/authenticated/${item.source_bucket}/${encodeObjectKey(item.source_object_key)}`;
  const response = await fetch(url, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || !response.body) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw Object.assign(new Error('source_download_failed'), { retryable });
  }
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    throw Object.assign(new Error('source_mime_invalid'), { retryable: false });
  }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > SOURCE_MAX_BYTES) {
    throw Object.assign(new Error('source_too_large'), { retryable: false });
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > SOURCE_MAX_BYTES) {
      await reader.cancel();
      throw Object.assign(new Error('source_too_large'), { retryable: false });
    }
    chunks.push(Buffer.from(value));
  }
  if (size < 32) throw Object.assign(new Error('source_too_small'), { retryable: false });
  return Buffer.concat(chunks, size);
}

async function transformImage(source) {
  assertMagic(source);
  let output;
  try {
    output = await sharp(source, { failOn: 'error', limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw Object.assign(new Error('image_decode_failed'), { retryable: false });
  }
  if (!output.info.width || !output.info.height || output.data.length > OUTPUT_MAX_BYTES) {
    throw Object.assign(new Error('image_output_invalid'), { retryable: false });
  }
  return output;
}

async function ensureStorageObject(s3, config, body, sha256, objectKey) {
  let head;
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }), {
      abortSignal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status !== 404 && error?.name !== 'NotFound' && error?.name !== 'NoSuchKey') throw error;
  }
  if (!head) {
    await s3.send(new PutObjectCommand({
      ...(config.supportsObjectAcl ? { ACL: 'public-read' } : {}),
      Bucket: config.bucket,
      Key: objectKey,
      Body: body,
      CacheControl: 'public, max-age=31536000, immutable',
      ContentLength: body.length,
      ContentType: 'image/webp',
      Metadata: { sha256 },
    }), { abortSignal: AbortSignal.timeout(25_000) });
    head = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }), {
      abortSignal: AbortSignal.timeout(15_000),
    });
  }
  if (head.ContentLength !== body.length || head.ContentType !== 'image/webp' || head.Metadata?.sha256 !== sha256) {
    throw Object.assign(new Error('spaces_verification_failed'), { retryable: false });
  }
}

async function processItem(context, item) {
  try {
    const source = await downloadSource(item, context.sourceOrigin, context.serviceKey);
    const sourceSha = createHash('sha256').update(source).digest('hex');
    const transformed = await transformImage(source);
    const outputSha = createHash('sha256').update(transformed.data).digest('hex');
    const kind = item.target_kind === 'place_image' ? 'place' : 'driver';
    const objectKey = `media/legacy-backfill/${kind}/${outputSha.slice(0, 2)}/${outputSha}.webp`;
    await ensureStorageObject(context.s3, context.storage, transformed.data, outputSha, objectKey);
    const publicUrl = `${context.storage.cdnBaseUrl}/${objectKey}`;
    const result = await rpc(context.supabase, 'complete_legacy_media_backfill_item', {
      p_item_id: item.item_id,
      p_lease_token: item.lease_token,
      p_source_sha256: sourceSha,
      p_output_bucket: context.storage.bucket,
      p_output_object_key: objectKey,
      p_output_public_url: publicUrl,
      p_output_sha256: outputSha,
      p_output_size_bytes: transformed.data.length,
      p_output_width: transformed.info.width,
      p_output_height: transformed.info.height,
    });
    return result === 'stale' ? 'stale' : 'completed';
  } catch (error) {
    const failureCode = safeCode(error);
    try {
      const result = await rpc(context.supabase, 'fail_legacy_media_backfill_item', {
        p_item_id: item.item_id,
        p_lease_token: item.lease_token,
        p_failure_code: failureCode,
        p_retryable: error?.retryable !== false,
      });
      return result === 'dead_letter' ? 'deadLetter' : 'retry';
    } catch {
      return 'leaseFailure';
    }
  }
}

async function mapConcurrent(values, concurrency, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) break;
      results[index] = await mapper(values[index]);
    }
  }));
  return results;
}

function objectStorageConfig() {
  const endpoint = new URL(requireOneEnv(['OBJECT_STORAGE_ENDPOINT', 'DO_SPACES_ENDPOINT']));
  const cdnBaseUrl = new URL(requireOneEnv(['OBJECT_STORAGE_PUBLIC_BASE_URL', 'DO_SPACES_CDN_BASE_URL']));
  const isR2 = endpoint.hostname.endsWith('.r2.cloudflarestorage.com');
  const isSpaces = endpoint.hostname.endsWith('.digitaloceanspaces.com');
  const isSupabaseStorage = endpoint.hostname.endsWith('.storage.supabase.co') && endpoint.pathname === '/storage/v1/s3';
  if (endpoint.protocol !== 'https:' || (!isR2 && !isSpaces && !isSupabaseStorage)) {
    throw new Error('invalid_object_storage_endpoint');
  }
  if (cdnBaseUrl.protocol !== 'https:' || cdnBaseUrl.search || cdnBaseUrl.hash) throw new Error('invalid_object_storage_public_url');
  const accessKeyId = requireOneEnv(['OBJECT_STORAGE_ACCESS_KEY_ID', 'DO_SPACES_ACCESS_KEY_ID']);
  const bucket = requireOneEnv(['OBJECT_STORAGE_PUBLIC_BUCKET', 'OBJECT_STORAGE_BUCKET', 'DO_SPACES_BUCKET']);
  const region = requireOneEnv(['OBJECT_STORAGE_REGION', 'DO_SPACES_REGION']);
  const secretAccessKey = requireOneEnv(['OBJECT_STORAGE_SECRET_ACCESS_KEY', 'DO_SPACES_SECRET_ACCESS_KEY']);
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(bucket)) throw new Error('invalid_object_storage_bucket');
  if (isR2 && region !== 'auto') throw new Error('invalid_r2_region');
  if (isSpaces && !/^[a-z]{2,5}\d(?:-\d)?$/u.test(region)) throw new Error('invalid_spaces_region');
  if (accessKeyId.length < 16 || secretAccessKey.length < 32) throw new Error('invalid_object_storage_credentials');
  return {
    accessKeyId,
    bucket,
    cdnBaseUrl: cdnBaseUrl.toString().replace(/\/$/u, ''),
    endpoint: endpoint.toString().replace(/\/$/u, ''),
    forcePathStyle: isSupabaseStorage,
    region,
    secretAccessKey,
    supportsObjectAcl: isSpaces,
  };
}

async function main() {
  const options = parseOptions();
  const sourceOrigin = new URL(requireEnv('NEXT_PUBLIC_SUPABASE_URL')).origin;
  const serviceKey = getServiceKey();
  const supabase = createClient(sourceOrigin, serviceKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const summary = { placeImages: 0, driverAvatars: 0, invalid: 0 };

  if (!options.apply) {
    await scanPlaces({ apply: false, checkpoint: null, sourceOrigin, supabase, runId: null, summary });
    await scanDrivers({ apply: false, checkpoint: null, sourceOrigin, supabase, runId: null, summary });
    await writeReport({ mode: 'dry-run', status: 'complete', ...summary });
    log('legacy_media_backfill_dry_run_complete', { candidates: summary.placeImages + summary.driverAvatars, invalid: summary.invalid });
    return;
  }

  const storage = objectStorageConfig();
  const s3 = new S3Client({
    region: storage.region,
    endpoint: storage.endpoint,
    forcePathStyle: storage.forcePathStyle,
    credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
  });
  const runId = options.runId || randomUUID();
  activeRunId = runId;
  let run = asRun(await rpc(supabase, 'begin_legacy_media_backfill', {
    p_run_id: runId,
    p_source_origin: sourceOrigin,
  }));
  await writeReport({ mode: 'apply', runId, status: run.status, handled: 0 });
  if (run.status === 'completed' || run.status === 'completed_with_errors') {
    log('legacy_media_backfill_already_complete', { complete: run.status === 'completed' });
    if (run.status !== 'completed') process.exitCode = 2;
    s3.destroy();
    return;
  }
  if (run.status === 'discovering') {
    if (!run.places_discovery_complete) await scanPlaces({
      apply: true, checkpoint: run.place_checkpoint, sourceOrigin, supabase, runId, summary,
    });
    if (!run.drivers_discovery_complete) await scanDrivers({
      apply: true, checkpoint: run.driver_checkpoint, sourceOrigin, supabase, runId, summary,
    });
    await rpc(supabase, 'seal_legacy_media_backfill_discovery', { p_run_id: runId });
  }

  const context = { s3, serviceKey, sourceOrigin, storage, supabase };
  const processed = { completed: 0, stale: 0, retry: 0, deadLetter: 0, leaseFailure: 0 };
  let handled = 0;
  let noWork = false;
  while (handled < options.maxItems) {
    const items = await rpc(supabase, 'claim_legacy_media_backfill_items', {
      p_run_id: runId,
      p_limit: Math.min(options.batchSize, options.maxItems - handled),
      p_lease_seconds: 120,
    });
    if (!items?.length) { noWork = true; break; }
    const results = await mapConcurrent(items, options.concurrency, (item) => processItem(context, item));
    for (const result of results) processed[result] += 1;
    handled += items.length;
    log('legacy_media_backfill_batch_complete', { handled, completed: processed.completed, stale: processed.stale });
  }

  let status = 'resume_required';
  if (noWork) {
    try {
      run = asRun(await rpc(supabase, 'finish_legacy_media_backfill', { p_run_id: runId }));
      status = run.status;
    } catch { status = 'resume_required'; }
  }
  await writeReport({ mode: 'apply', runId, status, handled, ...processed });
  log('legacy_media_backfill_run_stopped', { handled, complete: status === 'completed' });
  if (status !== 'completed') process.exitCode = 2;
  s3.destroy();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (error) => {
    await writeReport({
      mode: process.argv.includes('--apply') ? 'apply' : 'dry-run',
      ...(activeRunId ? { runId: activeRunId } : {}),
      status: 'failed',
      failureCode: safeCode(error),
    });
    process.stderr.write(`${JSON.stringify({ event: 'legacy_media_backfill_failed', failureCode: safeCode(error) })}\n`);
    process.exitCode = 1;
  });
}
