import 'server-only';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getDigitalOceanSpacesConfig } from '@/lib/env/server';
import { MEDIA_UPLOAD_URL_TTL_SECONDS } from '@/lib/media/contracts';

let cached:
  | {
      client: S3Client;
      configSignature: string;
      config: ReturnType<typeof getDigitalOceanSpacesConfig>;
    }
  | undefined;

const SPACES_READ_TIMEOUT_MS = 15_000;
const SPACES_WRITE_TIMEOUT_MS = 25_000;
const SPACES_DELETE_TIMEOUT_MS = 10_000;

function getSpaces() {
  const config = getDigitalOceanSpacesConfig();
  const configSignature = [
    config.region,
    config.endpoint,
    config.bucket,
    config.accessKeyId,
  ].join('|');
  if (!cached || cached.configSignature !== configSignature) {
    cached?.client.destroy();
    cached = {
      config,
      configSignature,
      client: new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: false,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      }),
    };
  }
  return cached;
}

export function getSpacesBucketName(): string {
  return getSpaces().config.bucket;
}

export function getPublicMediaUrl(objectKey: string): string {
  const encodedKey = objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${getSpaces().config.cdnBaseUrl}/${encodedKey}`;
}

export async function createPrivateStageUpload(input: {
  checksumSha256: string;
  contentType: string;
  objectKey: string;
  sizeBytes: number;
}) {
  const { client, config } = getSpaces();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.objectKey,
    Body: undefined,
    CacheControl: 'no-store, max-age=0',
    ContentLength: input.sizeBytes,
    ContentType: input.contentType,
    Metadata: { sha256: input.checksumSha256 },
  });
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: MEDIA_UPLOAD_URL_TTL_SECONDS,
  });
  return {
    uploadUrl,
    expiresInSeconds: MEDIA_UPLOAD_URL_TTL_SECONDS,
    requiredHeaders: {
      'cache-control': 'no-store, max-age=0',
      'content-type': input.contentType,
      'x-amz-meta-sha256': input.checksumSha256,
    },
  } as const;
}

export async function headSpaceObject(objectKey: string): Promise<HeadObjectCommandOutput> {
  const { client, config } = getSpaces();
  return client.send(
    new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    { abortSignal: AbortSignal.timeout(SPACES_READ_TIMEOUT_MS) },
  );
}

export async function readSpaceObject(objectKey: string, maximumBytes: number): Promise<Buffer> {
  const { client, config } = getSpaces();
  const response = await client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    { abortSignal: AbortSignal.timeout(SPACES_READ_TIMEOUT_MS) },
  );
  if (!response.Body) throw new Error('media_object_empty');

  // Do not use transformToByteArray here: the object may be replaced between
  // HEAD and GET, and buffering an attacker-controlled replacement before
  // checking its length would defeat the upload limit.
  const body = response.Body as AsyncIterable<Uint8Array> & {
    destroy?: (error?: Error) => void;
  };
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of body) {
    const bytes = Buffer.from(chunk);
    totalBytes += bytes.byteLength;
    if (totalBytes > maximumBytes) {
      body.destroy?.(new Error('media_object_size_invalid'));
      throw new Error('media_object_size_invalid');
    }
    chunks.push(bytes);
  }
  if (totalBytes === 0) throw new Error('media_object_empty');
  return Buffer.concat(chunks, totalBytes);
}

export async function writePublicMediaObject(input: {
  body: Buffer;
  checksumSha256: string;
  contentType: string;
  objectKey: string;
}) {
  const { client, config } = getSpaces();
  await client.send(
    new PutObjectCommand({
      ACL: 'public-read',
      Bucket: config.bucket,
      Key: input.objectKey,
      Body: input.body,
      CacheControl: 'public, max-age=31536000, immutable',
      ContentLength: input.body.byteLength,
      ContentType: input.contentType,
      Metadata: { sha256: input.checksumSha256 },
    }),
    { abortSignal: AbortSignal.timeout(SPACES_WRITE_TIMEOUT_MS) },
  );
}

export async function writePrivateMediaObject(input: {
  body: Buffer;
  checksumSha256: string;
  contentType: string;
  objectKey: string;
}) {
  const { client, config } = getSpaces();
  await client.send(
    new PutObjectCommand({
      ACL: 'private',
      Bucket: config.bucket,
      Key: input.objectKey,
      Body: input.body,
      CacheControl: 'private, no-store, max-age=0',
      ContentLength: input.body.byteLength,
      ContentType: input.contentType,
      Metadata: { sha256: input.checksumSha256 },
    }),
    { abortSignal: AbortSignal.timeout(SPACES_WRITE_TIMEOUT_MS) },
  );
}

export async function createPrivateMediaDownload(objectKey: string, expiresInSeconds = 60) {
  const { client, config } = getSpaces();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ResponseCacheControl: 'private, no-store, max-age=0',
    }),
    { expiresIn: Math.min(300, Math.max(30, expiresInSeconds)) },
  );
}

export async function deleteSpaceObject(objectKey: string): Promise<void> {
  const { client, config } = getSpaces();
  await client.send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    { abortSignal: AbortSignal.timeout(SPACES_DELETE_TIMEOUT_MS) },
  );
}
