import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  fetchSafeRemoteImage,
  isPublicNetworkAddress,
  UnsafeImageUrlError,
  validateHttpsImageUrlSyntax,
} from '../../lib/commerce/excel/image-fetch.ts';
import {
  normalizeHeader,
  normalizeProductKey,
  normalizeSku,
  parseEgpToPiastres,
  parseWorkbookBoolean,
  sanitizeSpreadsheetText,
} from '../../lib/commerce/excel/validation.ts';
import {
  assertProductWorkbookUploadMetadata,
  UnsafeWorkbookError,
} from '../../lib/commerce/excel/zip-safety.ts';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('Arabic-friendly headers, identifiers and typed values normalize deterministically', () => {
  assert.equal(normalizeHeader('  اسم المُنتج  '), 'name');
  assert.equal(normalizeHeader('السعر بالجنيه'), 'price_egp');
  assert.equal(normalizeHeader('رابط الصورة'), 'image_url');
  assert.equal(normalizeProductKey('  قهوة عربي  '), 'قهوه-عربي');
  assert.equal(normalizeSku(' sku ١٢ / red '), 'SKU-12-/-RED');
  assert.equal(parseEgpToPiastres('١٬٢٥٠٫٥٠ ج.م'), 125_050);
  assert.equal(parseEgpToPiastres('10.005'), null);
  assert.equal(parseWorkbookBoolean('نعم'), true);
  assert.equal(parseWorkbookBoolean('لا'), false);
});

test('spreadsheet export text neutralizes formula injection after leading whitespace', () => {
  for (const value of ['=1+1', '+SUM(A1:A2)', '-2+3', '@cmd', '  =HYPERLINK("https://bad")']) {
    assert.equal(sanitizeSpreadsheetText(value).startsWith("'"), true, value);
  }
  assert.equal(sanitizeSpreadsheetText('normal product'), 'normal product');
  assert.equal(sanitizeSpreadsheetText('SKU-100'), 'SKU-100');
});

test('upload metadata rejects legacy, macro-enabled and oversized workbook envelopes', () => {
  assert.doesNotThrow(() => assertProductWorkbookUploadMetadata({
    fileName: 'products.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byteLength: 1024,
  }));
  for (const input of [
    { fileName: 'products.xlsm', contentType: 'application/vnd.ms-excel.sheet.macroenabled.12', byteLength: 1024 },
    { fileName: '../products.xlsx', contentType: 'application/octet-stream', byteLength: 1024 },
    { fileName: 'products.xlsx', contentType: 'text/csv', byteLength: 1024 },
    { fileName: 'products.xlsx', contentType: 'application/octet-stream', byteLength: 11 * 1024 * 1024 },
  ]) {
    assert.throws(() => assertProductWorkbookUploadMetadata(input), UnsafeWorkbookError);
  }
});

test('image URL syntax accepts only standard-port public HTTPS candidates', () => {
  assert.equal(validateHttpsImageUrlSyntax('https://images.example.com/p/one.webp').protocol, 'https:');
  for (const value of [
    'http://images.example.com/a.png',
    'https://user:pass@images.example.com/a.png',
    'https://images.example.com:8443/a.png',
    'https://localhost/a.png',
    'https://metadata.google.internal/a.png',
    'https://127.0.0.1/a.png',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/a.png',
    'https://images.example.com/a.png#fragment',
  ]) {
    assert.throws(() => validateHttpsImageUrlSyntax(value), UnsafeImageUrlError, value);
  }
});

test('private, link-local, carrier NAT, documentation and metadata addresses are blocked', () => {
  for (const address of [
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '203.0.113.10',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
  ]) {
    assert.equal(isPublicNetworkAddress(address), false, address);
  }
  assert.equal(isPublicNetworkAddress('93.184.216.34'), true);
  assert.equal(isPublicNetworkAddress('2606:4700:4700::1111'), true);
});

test('safe image fetch pins vetted DNS and returns a matching raster image without live network', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const resolverCalls = [];
  const transportCalls = [];
  const result = await fetchSafeRemoteImage('https://images.example.com/item.png', {
    resolver: {
      async resolve(hostname) {
        resolverCalls.push(hostname);
        return [{ address: '93.184.216.34', family: 4 }];
      },
    },
    async transport(request) {
      transportCalls.push(request);
      return {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': String(png.length) },
        body: png,
      };
    },
  });
  assert.equal(result.mimeType, 'image/png');
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(resolverCalls, ['images.example.com']);
  assert.equal(transportCalls[0].address.address, '93.184.216.34');
});

test('every redirect is revalidated before DNS resolution or a second request', async () => {
  let requests = 0;
  await assert.rejects(
    fetchSafeRemoteImage('https://images.example.com/item.png', {
      resolver: {
        async resolve() {
          return [{ address: '93.184.216.34', family: 4 }];
        },
      },
      async transport() {
        requests += 1;
        return {
          status: 302,
          headers: { location: 'https://169.254.169.254/latest/meta-data' },
          body: Buffer.alloc(0),
        };
      },
    }),
    (error) => error instanceof UnsafeImageUrlError && error.code === 'blocked_host',
  );
  assert.equal(requests, 1);
});

test('mixed public/private DNS and MIME mismatches fail before persistence', async () => {
  let transportCalled = false;
  await assert.rejects(
    fetchSafeRemoteImage('https://mixed.example.com/item.png', {
      resolver: {
        async resolve() {
          return [
            { address: '93.184.216.34', family: 4 },
            { address: '10.0.0.2', family: 4 },
          ];
        },
      },
      async transport() {
        transportCalled = true;
        throw new Error('must not run');
      },
    }),
    (error) => error instanceof UnsafeImageUrlError && error.code === 'blocked_address',
  );
  assert.equal(transportCalled, false);

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0]);
  await assert.rejects(
    fetchSafeRemoteImage('https://images.example.com/item.png', {
      resolver: { async resolve() { return [{ address: '93.184.216.34', family: 4 }]; } },
      async transport() {
        return { status: 200, headers: { 'content-type': 'image/png' }, body: jpeg };
      },
    }),
    (error) => error instanceof UnsafeImageUrlError && error.code === 'mime_mismatch',
  );
});

test('workbook implementation enforces limits, duplicate SKU rejection and adapter boundaries', () => {
  const parser = read('lib/commerce/excel/product-workbook.ts');
  const exporter = read('lib/commerce/excel/export-product-workbook.ts');
  const contract = read('lib/commerce/excel/contract.ts');
  const zipSafety = read('lib/commerce/excel/zip-safety.ts');

  assert.match(parser, /seenSkus\.has\(sku\)[\s\S]{0,220}duplicate_sku/);
  assert.match(parser, /formula_forbidden/);
  assert.doesNotMatch(parser, /status = 'pending_review'/);
  assert.match(contract, /first-publish moderation/);
  assert.match(contract, /productKey: string/);
  assert.match(exporter, /product\.images/);
  assert.match(exporter, /spreadsheetText\(product\.name\)/);
  assert.match(exporter, /sanitizeSpreadsheetText/);
  assert.match(contract, /ProductImportPersistenceAdapter/);
  assert.match(contract, /dryRun: boolean/);
  assert.match(zipSafety, /vbaproject\.bin/);
  assert.match(zipSafety, /maxCompressionRatio/);
  assert.match(zipSafety, /externallinks/);
});

test('production image transport pins the vetted address through an HTTPS lookup callback', () => {
  const source = read('lib/commerce/excel/image-fetch.ts');
  assert.match(source, /lookup\(_hostname, _options, callback\)/);
  assert.match(source, /callback\(null, input\.address\.address, input\.address\.family\)/);
  assert.match(source, /received > input\.maxBytes/);
  assert.match(source, /request\.setTimeout/);
});
