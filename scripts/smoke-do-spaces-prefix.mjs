import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const endpoint = new URL(required('DO_SPACES_ENDPOINT'));
if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.digitaloceanspaces.com')) {
  throw new Error('DO_SPACES_ENDPOINT must be an HTTPS DigitalOcean Spaces endpoint.');
}

const bucket = required('DO_SPACES_BUCKET');
const runId = required('CI_RUN_ID').replace(/[^a-zA-Z0-9._-]/gu, '-').slice(0, 80);
const prefix = `ci-smoke/${runId}/${randomUUID()}/`;
const key = `${prefix}probe.txt`;
const createdKeys = new Set();
const client = new S3Client({
  endpoint: endpoint.origin,
  region: required('DO_SPACES_REGION'),
  forcePathStyle: false,
  credentials: {
    accessKeyId: required('DO_SPACES_ACCESS_KEY_ID'),
    secretAccessKey: required('DO_SPACES_SECRET_ACCESS_KEY'),
  },
});

try {
  // Record the intended key before the request: an interrupted response may
  // still mean the remote write committed and therefore needs cleanup.
  createdKeys.add(key);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: Buffer.from('dairtak-spaces-ci-smoke-v1\n', 'utf8'),
    ContentType: 'text/plain',
    CacheControl: 'no-store',
  }));
  await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const downloaded = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await downloaded.Body?.transformToString('utf8');
  if (body !== 'dairtak-spaces-ci-smoke-v1\n') throw new Error('Spaces smoke payload mismatch.');
  const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 10 }));
  if (!listed.Contents?.some((object) => object.Key === key)) throw new Error('Spaces smoke object was not listed.');
} finally {
  for (const createdKey of createdKeys) {
    if (!createdKey.startsWith(prefix)) throw new Error('Refusing cleanup outside the exact CI prefix.');
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: createdKey }));
  }
}

const remaining = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1 }));
if ((remaining.KeyCount ?? 0) !== 0) throw new Error('Spaces smoke cleanup left objects under its exact prefix.');
process.stdout.write(`Spaces smoke completed and cleaned ${prefix}\n`);
