import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'instance-data.ec2.internal',
  '169.254.169.254',
]);

export class UnsafeImageUrlError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'UnsafeImageUrlError';
    this.code = code;
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface ImageDnsResolver {
  resolve(hostname: string): Promise<ResolvedAddress[]>;
}

export interface ImageTransportResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

export interface ImageTransportRequest {
  url: URL;
  address: ResolvedAddress;
  timeoutMs: number;
  maxBytes: number;
}

export type ImageTransport = (request: ImageTransportRequest) => Promise<ImageTransportResponse>;

export interface SafeImageFetchOptions {
  resolver?: ImageDnsResolver;
  transport?: ImageTransport;
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
}

export interface SafeFetchedImage {
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
  sha256: string;
  sourceUrl: string;
  finalUrl: string;
  redirects: number;
}

const productionResolver: ImageDnsResolver = {
  async resolve(hostname) {
    if (isIP(hostname)) {
      return [{ address: hostname, family: isIP(hostname) as 4 | 6 }];
    }
    const answers = await dnsLookup(hostname, { all: true, verbatim: true });
    return answers.map((answer) => ({
      address: answer.address,
      family: answer.family as 4 | 6,
    }));
  },
};

export function validateHttpsImageUrlSyntax(input: string): URL {
  if (typeof input !== 'string' || input.length === 0 || input.length > 2_048) {
    throw new UnsafeImageUrlError('invalid_url', 'Image URLs must contain between 1 and 2048 characters.');
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeImageUrlError('invalid_url', 'The image URL is malformed.');
  }

  if (url.protocol !== 'https:') {
    throw new UnsafeImageUrlError('https_required', 'Only HTTPS image URLs are accepted.');
  }
  if (url.username || url.password) {
    throw new UnsafeImageUrlError('credentials_forbidden', 'Credentials are not allowed in image URLs.');
  }
  if (url.port && url.port !== '443') {
    throw new UnsafeImageUrlError('port_forbidden', 'Image URLs may only use the standard HTTPS port.');
  }
  if (url.hash) {
    throw new UnsafeImageUrlError('fragment_forbidden', 'Image URL fragments are not accepted.');
  }

  const hostname = canonicalHostname(url.hostname);
  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.home')
  ) {
    throw new UnsafeImageUrlError('blocked_host', 'The image host is private or reserved.');
  }
  if (isIP(hostname) && !isPublicNetworkAddress(hostname)) {
    throw new UnsafeImageUrlError('blocked_address', 'The image URL resolves to a private or reserved address.');
  }

  return url;
}

export async function fetchSafeRemoteImage(
  input: string,
  options: SafeImageFetchOptions = {},
): Promise<SafeFetchedImage> {
  const resolver = options.resolver ?? productionResolver;
  const transport = options.transport ?? productionImageTransport;
  const maxRedirects = options.maxRedirects ?? 3;
  const maxBytes = options.maxBytes ?? 12 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 10_000;

  if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 5) {
    throw new TypeError('maxRedirects must be between 0 and 5.');
  }
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 20 * 1024 * 1024) {
    throw new TypeError('maxBytes must be between 1 byte and 20 MB.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new TypeError('timeoutMs must be between 100 and 30000 milliseconds.');
  }

  const sourceUrl = validateHttpsImageUrlSyntax(input).toString();
  let current = new URL(sourceUrl);
  const deadline = Date.now() + timeoutMs;

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    current = validateHttpsImageUrlSyntax(current.toString());
    const hostname = canonicalHostname(current.hostname);
    const remainingForDns = deadline - Date.now();
    if (remainingForDns <= 0) {
      throw new UnsafeImageUrlError('timeout', 'The remote image request timed out.');
    }
    let answers: ResolvedAddress[];
    try {
      answers = await withTimeout(resolver.resolve(hostname), remainingForDns);
    } catch (error) {
      if (error instanceof UnsafeImageUrlError) throw error;
      throw new UnsafeImageUrlError('dns_failure', 'The image host could not be resolved safely.');
    }
    if (answers.length === 0) {
      throw new UnsafeImageUrlError('dns_empty', 'The image host did not resolve to an address.');
    }
    if (
      answers.some(
        (answer) =>
          isIP(answer.address) !== answer.family ||
          !isPublicNetworkAddress(answer.address),
      )
    ) {
      throw new UnsafeImageUrlError('blocked_address', 'The image host resolves to a private or reserved address.');
    }

    const selected = [...answers].sort((left, right) => left.family - right.family)[0]!;
    const remainingForRequest = deadline - Date.now();
    if (remainingForRequest <= 0) {
      throw new UnsafeImageUrlError('timeout', 'The remote image request timed out.');
    }
    let response: ImageTransportResponse;
    try {
      response = await transport({
        url: current,
        address: selected,
        timeoutMs: remainingForRequest,
        maxBytes,
      });
    } catch (error) {
      if (error instanceof UnsafeImageUrlError) throw error;
      throw new UnsafeImageUrlError('transport_failure', 'The image could not be downloaded safely.');
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === maxRedirects) {
        throw new UnsafeImageUrlError('redirect_limit', 'The image URL exceeded the redirect limit.');
      }
      const location = firstHeader(response.headers.location);
      if (!location) {
        throw new UnsafeImageUrlError('redirect_location', 'The image server returned a redirect without a destination.');
      }
      current = validateHttpsImageUrlSyntax(new URL(location, current).toString());
      continue;
    }

    if (response.status !== 200) {
      throw new UnsafeImageUrlError('http_status', `The image server returned HTTP ${response.status}.`);
    }

    const contentLength = firstHeader(response.headers['content-length']);
    if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes)) {
      throw new UnsafeImageUrlError('image_too_large', 'The remote image exceeds the byte limit.');
    }
    if (response.body.byteLength === 0 || response.body.byteLength > maxBytes) {
      throw new UnsafeImageUrlError('image_too_large', 'The remote image is empty or exceeds the byte limit.');
    }

    const declaredMime = (firstHeader(response.headers['content-type']) ?? '')
      .split(';', 1)[0]!
      .trim()
      .toLocaleLowerCase('en-US');
    if (!ALLOWED_IMAGE_MIME_TYPES.has(declaredMime)) {
      throw new UnsafeImageUrlError('mime_type', 'The remote response is not an allowed raster image.');
    }

    const detectedMime = detectRasterImageMime(response.body);
    if (!detectedMime || detectedMime !== declaredMime) {
      throw new UnsafeImageUrlError('mime_mismatch', 'The image bytes do not match the declared MIME type.');
    }

    return {
      bytes: response.body,
      mimeType: detectedMime,
      sha256: createHash('sha256').update(response.body).digest('hex'),
      sourceUrl,
      finalUrl: current.toString(),
      redirects,
    };
  }

  throw new UnsafeImageUrlError('redirect_limit', 'The image URL exceeded the redirect limit.');
}

export function isPublicNetworkAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

export function detectRasterImageMime(
  bytes: Buffer,
): SafeFetchedImage['mimeType'] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (bytes.length >= 16 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brands = bytes.subarray(8, Math.min(bytes.length, 32)).toString('ascii');
    if (brands.includes('avif') || brands.includes('avis')) return 'image/avif';
  }
  return null;
}

async function productionImageTransport(input: ImageTransportRequest): Promise<ImageTransportResponse> {
  return await new Promise<ImageTransportResponse>((resolve, reject) => {
    let settled = false;
    const request = httpsRequest(
      input.url,
      {
        method: 'GET',
        agent: false,
        headers: {
          accept: 'image/avif,image/webp,image/png,image/jpeg',
          'user-agent': 'DAIRTAK-Product-Importer/1.0',
        },
        lookup(_hostname, _options, callback) {
          callback(null, input.address.address, input.address.family);
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const headers = response.headers;
        if (status !== 200) {
          response.destroy();
          settled = true;
          resolve({ status, headers, body: Buffer.alloc(0) });
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;
        response.on('data', (chunk: Buffer | Uint8Array) => {
          const buffer = Buffer.from(chunk);
          received += buffer.byteLength;
          if (received > input.maxBytes) {
            response.destroy(new UnsafeImageUrlError('image_too_large', 'The remote image exceeds the byte limit.'));
            return;
          }
          chunks.push(buffer);
        });
        response.on('end', () => {
          if (settled) return;
          settled = true;
          resolve({ status, headers, body: Buffer.concat(chunks, received) });
        });
        response.on('error', (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });
      },
    );

    request.setTimeout(input.timeoutMs, () => {
      request.destroy(new UnsafeImageUrlError('timeout', 'The remote image request timed out.'));
    });
    request.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    request.end();
  });
}

function canonicalHostname(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLocaleLowerCase('en-US');
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new UnsafeImageUrlError('timeout', 'The remote image request timed out.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const value = (((octets[0]! << 24) >>> 0) + (octets[1]! << 16) + (octets[2]! << 8) + octets[3]!) >>> 0;
  const blockedRanges: ReadonlyArray<readonly [number, number]> = [
    [0x00000000, 8],
    [0x0a000000, 8],
    [0x64400000, 10],
    [0x7f000000, 8],
    [0xa9fe0000, 16],
    [0xac100000, 12],
    [0xc0000000, 24],
    [0xc0000200, 24],
    [0xc0586300, 24],
    [0xc0a80000, 16],
    [0xc6120000, 15],
    [0xc6336400, 24],
    [0xcb007100, 24],
    [0xe0000000, 4],
    [0xf0000000, 4],
  ];
  return !blockedRanges.some(([network, prefix]) => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) >>> 0 === (network & mask) >>> 0;
  });
}

function isPublicIpv6(address: string): boolean {
  const groups = parseIpv6Groups(address);
  if (!groups) return false;

  // Public IPv6 unicast space is currently allocated from 2000::/3.
  if ((groups[0]! & 0xe000) !== 0x2000) return false;

  // Documentation-only 2001:db8::/32 must never be contacted.
  return !(groups[0] === 0x2001 && groups[1] === 0x0db8);
}

function parseIpv6Groups(address: string): number[] | null {
  const zoneIndex = address.indexOf('%');
  const clean = zoneIndex >= 0 ? address.slice(0, zoneIndex) : address;
  const sections = clean.split('::');
  if (sections.length > 2) return null;

  const left = sections[0] ? sections[0].split(':') : [];
  const right = sections.length === 2 && sections[1] ? sections[1]!.split(':') : [];
  const expandIpv4Tail = (parts: string[]): string[] | null => {
    if (parts.length === 0 || !parts.at(-1)?.includes('.')) return parts;
    const tail = parts.at(-1)!.split('.').map(Number);
    if (tail.length !== 4 || tail.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    return [
      ...parts.slice(0, -1),
      ((tail[0]! << 8) | tail[1]!).toString(16),
      ((tail[2]! << 8) | tail[3]!).toString(16),
    ];
  };

  const expandedLeft = expandIpv4Tail(left);
  const expandedRight = expandIpv4Tail(right);
  if (!expandedLeft || !expandedRight) return null;
  const missing = 8 - expandedLeft.length - expandedRight.length;
  if ((sections.length === 1 && missing !== 0) || (sections.length === 2 && missing < 1)) return null;
  const groups = [
    ...expandedLeft,
    ...Array.from({ length: Math.max(0, missing) }, () => '0'),
    ...expandedRight,
  ];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null;

  return groups.map((group) => Number.parseInt(group, 16));
}
