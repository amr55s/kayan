import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('legacy PIN registration is removed by the production migration', () => {
  const migration = read(
    'supabase/migrations/202607270003_account_ownership_requests.sql',
  );
  assert.match(migration, /drop function if exists public\.register_public_driver/);
  assert.match(migration, /drop function if exists public\.renew_public_driver/);
  assert.match(migration, /drop column if exists pin_code/);
  assert.match(migration, /drop column if exists pin_code_hash/);
});

test('public account requests use reviewed Auth accounts', () => {
  const actions = read('lib/operations/actions.ts');
  const driverModal = read('components/delivery/DriverModal.tsx');
  const merchantModal = read('components/modals/AddListingModal.tsx');
  const adminManager = read('components/admin/AccountRequestManager.tsx');

  assert.match(actions, /submitAccountRequest/);
  assert.match(actions, /approveAccountRequest/);
  assert.match(actions, /consume_account_request_rate_limit/);
  assert.doesNotMatch(actions, /renewDriverWithPin|register_public_driver/);
  assert.match(driverModal, /إرسال طلب الحساب/);
  assert.match(merchantModal, /ربط مكان موجود/);
  assert.match(merchantModal, /إضافة خدمة جديدة/);
  assert.match(adminManager, /موافقة وتفعيل/);
});

test('selected category text keeps high contrast', () => {
  const categoryBar = read('components/directory/CategoryBar.tsx');
  const merchantModal = read('components/modals/AddListingModal.tsx');
  const globalStyles = read('app/globals.css');
  assert.match(
    categoryBar,
    /isSelected \? 'text-white dark:text-zinc-950'/,
  );
  assert.match(merchantModal, /kayan-account-mode-tab/);
  assert.match(
    globalStyles,
    /\.kayan-account-mode-tab\[aria-selected='true'\]\s*\{[\s\S]*color:\s*#fff\s*!important/,
  );
  assert.doesNotMatch(categoryBar, /transition-all/);
});

test('public branding uses KAYAN CITY SPOT consistently', () => {
  const brand = read('lib/brand.ts');
  const manifest = read('public/manifest.json');
  const serviceWorker = read('public/sw.js');
  const publicFiles = [
    'app/layout.tsx',
    'components/layout/Header.tsx',
    'components/directory/DirectoryView.tsx',
    'components/auth/LoginForm.tsx',
    'components/operations/DashboardHeader.tsx',
    'lib/share.ts',
  ];

  assert.match(brand, /KAYAN CITY SPOT \| كيان سيتي سبوت/);
  assert.match(manifest, /KAYAN CITY SPOT \| كيان سيتي سبوت/);
  assert.match(serviceWorker, /KAYAN CITY SPOT \| كيان سيتي سبوت/);
  assert.match(
    read('components/directory/DirectoryView.tsx'),
    /للتواصل مع الدعم:[\s\S]*01094552421/,
  );

  for (const file of publicFiles) {
    assert.doesNotMatch(read(file), /خدمات الكيان|كيان هب|Kayan Hub|KayanHub/);
  }
});

test('listing images are optimized before storage without sacrificing menu resolution', () => {
  const clientPipeline = read('lib/images/client.ts');
  const serverPipeline = read('lib/images/server.ts');
  const storageAction = read('lib/supabase/actions.ts');
  const nextConfig = read('next.config.ts');
  const imageForms = [
    'components/admin/EditPlaceModal.tsx',
    'components/modals/AddListingModal.tsx',
    'components/modals/FeedbackModal.tsx',
    'components/operations/MerchantOrderWorkspace.tsx',
  ];

  assert.match(clientPipeline, /MAX_WIDTH = 2400/);
  assert.match(clientPipeline, /MAX_HEIGHT = 3400/);
  assert.match(clientPipeline, /TARGET_UPLOAD_BYTES = 1_050_000/);
  assert.match(clientPipeline, /SERVER_FALLBACK_BYTES = 3_400_000/);
  assert.match(clientPipeline, /using server fallback/);
  assert.match(clientPipeline, /image\/webp/);
  assert.match(clientPipeline, /imageSmoothingQuality = 'high'/);
  assert.match(serverPipeline, /\.rotate\(\)/);
  assert.match(serverPipeline, /\.sharpen\(\{ sigma: 0\.45 \}\)/);
  assert.match(serverPipeline, /\.webp\(\{/);
  assert.match(serverPipeline, /PASSTHROUGH_WEBP_BYTES/);
  assert.match(serverPipeline, /source\.format === 'webp'/);
  assert.match(storageAction, /contentType: processed\.contentType/);
  assert.match(storageAction, /cacheControl: '31536000'/);
  assert.match(storageAction, /toPlainArrayBuffer\(processed\.buffer\)/);
  assert.match(storageAction, /STORAGE_UPLOAD_ATTEMPTS = 2/);
  assert.doesNotMatch(storageAction, /ALLOWED_IMAGE_TYPES/);
  assert.match(nextConfig, /bodySizeLimit: '4mb'/);
  for (const form of imageForms) {
    assert.match(read(form), /uploadOptimizedImages/);
  }
});

test('storage image bytes are copied out of SharedArrayBuffer exactly', async () => {
  const { toPlainArrayBuffer } = await import('../lib/images/buffer.ts');
  const shared = new SharedArrayBuffer(12);
  const source = new Uint8Array(shared, 3, 4);
  source.set([11, 22, 33, 44]);

  const copied = toPlainArrayBuffer(source);
  assert.ok(copied instanceof ArrayBuffer);
  assert.equal(copied.byteLength, 4);
  assert.deepEqual(Array.from(new Uint8Array(copied)), [11, 22, 33, 44]);
});

test('admin mutations recover from transient response failures', () => {
  const adminWorkspace = read('components/operations/AdminWorkspace.tsx');
  const feedbackModal = read('components/admin/FeedbackDetailsModal.tsx');
  const adminError = read('app/admin/error.tsx');
  const serverClient = read('lib/supabase/server.ts');

  assert.match(adminWorkspace, /recoverFromActionError/);
  assert.match(feedbackModal, /try \{[\s\S]*applyFeedbackToPlace/);
  assert.match(adminError, /window\.setTimeout\(reset, 1200\)/);
  assert.match(serverClient, /AbortSignal\.timeout\(10_000\)/);
});

test('image and admin server actions return safe results instead of crashing RSC', () => {
  const storageAction = read('lib/supabase/actions.ts');
  const clientPipeline = read('lib/images/client.ts');
  const adminActions = read('lib/supabase/admin-actions.ts');
  const adminPage = read('app/admin/page.tsx');

  assert.match(storageAction, /export type ImageUploadResult/);
  assert.match(
    storageAction,
    /uploadImageToStorage\([\s\S]*Promise<ImageUploadResult>/,
  );
  assert.match(
    storageAction,
    /Storage upload exception:[\s\S]*success: false/,
  );
  assert.match(clientPipeline, /failedFiles: string\[\]/);
  assert.match(clientPipeline, /continue;/);
  assert.match(
    adminActions,
    /serverApprovePendingRequest[\s\S]*catch \(error\)/,
  );
  assert.match(adminPage, /safeAdminQuery/);
});
