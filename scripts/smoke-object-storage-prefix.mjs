import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

function requiredOne(names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`${names.join(' or ')} is required.`);
}

const endpoint = new URL(requiredOne(['OBJECT_STORAGE_ENDPOINT', 'DO_SPACES_ENDPOINT']));
const isR2 = endpoint.hostname.endsWith('.r2.cloudflarestorage.com');
const isSpaces = endpoint.hostname.endsWith('.digitaloceanspaces.com');
if (endpoint.protocol !== 'https:' || (!isR2 && !isSpaces)) {
  throw new Error('Object storage must use an HTTPS Cloudflare R2 or DigitalOcean Spaces endpoint.');
}

const region = requiredOne(['OBJECT_STORAGE_REGION', 'DO_SPACES_REGION']);
if (isR2 && region !== 'auto') throw new Error('Cloudflare R2 requires region auto.');

const bucket = requiredOne(['OBJECT_STORAGE_PRIVATE_BUCKET', 'OBJECT_STORAGE_BUCKET', 'DO_SPACES_BUCKET']);
const publicBucket = requiredOne(['OBJECT_STORAGE_PUBLIC_BUCKET', 'OBJECT_STORAGE_BUCKET', 'DO_SPACES_BUCKET']);
if (isR2 && bucket === publicBucket) {
  throw new Error('Cloudflare R2 requires separate private and public buckets.');
}
const runId = requiredOne(['CI_RUN_ID']).replace(/[^a-zA-Z0-9._-]/gu, '-').slice(0, 80);
const prefix = `ci-smoke/${runId}/${randomUUID()}/`;
const key = `${prefix}probe.txt`;
const createdKeys = new Set();
const client = new S3Client({
  endpoint: endpoint.origin,
  region,
  forcePathStyle: false,
  credentials: {
    accessKeyId: requiredOne(['OBJECT_STORAGE_ACCESS_KEY_ID', 'DO_SPACES_ACCESS_KEY_ID']),
    secretAccessKey: requiredOne(['OBJECT_STORAGE_SECRET_ACCESS_KEY', 'DO_SPACES_SECRET_ACCESS_KEY']),
  },
});

try {
  // Record the intended key before the request: an interrupted response may
  // still mean the remote write committed and therefore needs cleanup.
  createdKeys.add(key);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: Buffer.from('dairtak-object-storage-ci-smoke-v1\n', 'utf8'),
    ContentType: 'text/plain',
    CacheControl: 'no-store',
  }));
  await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const downloaded = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await downloaded.Body?.transformToString('utf8');
  if (body !== 'dairtak-object-storage-ci-smoke-v1\n') throw new Error('Object storage smoke payload mismatch.');
  const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 10 }));
  if (!listed.Contents?.some((object) => object.Key === key)) throw new Error('Smoke object was not listed.');
} finally {
  for (const createdKey of createdKeys) {
    if (!createdKey.startsWith(prefix)) throw new Error('Refusing cleanup outside the exact CI prefix.');
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: createdKey }));
  }
  client.destroy();
}

const verificationClient = new S3Client({
  endpoint: endpoint.origin,
  region,
  forcePathStyle: false,
  credentials: {
    accessKeyId: requiredOne(['OBJECT_STORAGE_ACCESS_KEY_ID', 'DO_SPACES_ACCESS_KEY_ID']),
    secretAccessKey: requiredOne(['OBJECT_STORAGE_SECRET_ACCESS_KEY', 'DO_SPACES_SECRET_ACCESS_KEY']),
  },
});
try {
  const remaining = await verificationClient.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1 }));
  if ((remaining.KeyCount ?? 0) !== 0) throw new Error('Object storage smoke cleanup left objects under its exact prefix.');
} finally {
  verificationClient.destroy();
}
process.stdout.write(`Object storage smoke completed and cleaned ${prefix}\n`);
