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

test('native select options submit stable values and legacy labels are normalized', async () => {
  const merchantModal = read('components/modals/AddListingModal.tsx');
  const userEditor = read('components/admin/UserEditorModal.tsx');
  const compatibilityLayer = read('components/ui/heroui-compat.tsx');
  const operations = read('lib/operations/actions.ts');
  const { accountRequestSchema, listingCategorySchema } = await import(
    '../lib/operations/validation.ts'
  );

  assert.match(
    merchantModal,
    /<SelectItem key=\{item\.id\} value=\{item\.id\}>/,
  );
  assert.match(
    merchantModal,
    /<SelectItem key=\{place\.id\} value=\{place\.id\}>/,
  );
  assert.match(userEditor, /key="admin" value="admin"/);
  assert.match(
    userEditor,
    /key=\{merchant\.id\} value=\{merchant\.id\}/,
  );
  assert.match(compatibilityLayer, /value: string \| number/);
  assert.match(operations, /Server action validation failed/);

  assert.equal(listingCategorySchema.parse('pharmacy'), 'pharmacy');
  assert.equal(listingCategorySchema.parse('صيدليات وطب'), 'pharmacy');
  assert.equal(listingCategorySchema.parse('💊 صيدليات وطب'), 'pharmacy');
  assert.throws(
    () => listingCategorySchema.parse('تصنيف غير موجود'),
    /اختر تصنيفاً صحيحاً من القائمة/,
  );
  const request = accountRequestSchema.parse({
    kind: 'merchant',
    displayName: 'اسم مسؤول الصيدلية',
    phone: '01008747011',
    whatsapp: '01008747011',
    password: 'strong-password-123',
    placeMode: 'new',
    existingPlaceId: null,
    placeTitle: 'صيدلية دكتورة نور هاشم',
    placeCategory: '💊 صيدليات وطب',
    placeWhatsapp: '01008747011',
    placePayment: '01008747011',
    placeDescription: '',
  });
  assert.equal(request.placeCategory, 'pharmacy');
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

  assert.match(brand, /export const SITE_NAME = 'KAYAN CITY SPOT';/);
  assert.match(manifest, /"name": "KAYAN CITY SPOT",/);
  assert.match(serviceWorker, /KAYAN CITY SPOT/);
  assert.match(
    read('components/directory/DirectoryView.tsx'),
    /انضم لجروب KAYAN CITY SPOT على واتساب/,
  );

  for (const file of publicFiles) {
    assert.doesNotMatch(read(file), /خدمات الكيان|كيان هب|Kayan Hub|KayanHub/);
  }
});

test('WhatsApp support link stays visible across the whole site', () => {
  const layout = read('app/layout.tsx');
  const groupButton = read('components/layout/WhatsAppGroupButton.tsx');
  const installer = read('components/layout/PwaInstaller.tsx');

  assert.match(layout, /<WhatsAppGroupButton \/>/);
  assert.match(
    groupButton,
    /WHATSAPP_GROUP_URL/,
  );
  assert.match(
    read('lib/community.ts'),
    /https:\/\/chat\.whatsapp\.com\/JTuPs9xv0CZAZhpzxttU3R\?mode=gi_t/,
  );
  assert.match(groupButton, /size-12/);
  assert.match(groupButton, /sm:size-auto/);
  assert.match(groupButton, /fixed bottom-/);
  assert.match(groupButton, /جروب KAYAN CITY SPOT/);
  assert.match(groupButton, /انضم عبر واتساب/);
  assert.doesNotMatch(groupButton, /01094552421/);
  assert.match(read('lib/community.ts'), /chat\.whatsapp\.com/);
  assert.match(groupButton, /target="_blank"/);
  assert.match(groupButton, /rel="noopener noreferrer"/);
  assert.match(
    installer,
    /bottom-\[calc\(5\.5rem\+env\(safe-area-inset-bottom\)\)\][\s\S]*sm:bottom-4/,
  );
});

test('driver contact fields stay explicit while public cards expose actions only', () => {
  const modal = read('components/delivery/DriverModal.tsx');
  const card = read('components/delivery/DriverCard.tsx');
  const bar = read('components/delivery/DeliveryBar.tsx');

  assert.match(modal, /label="رقم للتواصل"/);
  assert.match(modal, /label="رقم للواتس"/);
  assert.match(modal, /name="whatsapp"[\s\S]*isRequired|isRequired[\s\S]*name="whatsapp"/);
  assert.doesNotMatch(card, /للتواصل:/);
  assert.doesNotMatch(card, /للواتس:/);
  assert.match(card, />\s*واتساب\s*</);
  assert.match(card, />\s*اتصال\s*</);
  assert.match(card, /whatsapp_click/);
  assert.match(card, /phone_click/);
  assert.doesNotMatch(card, />\s*التفاصيل\s*</);
  assert.doesNotMatch(bar, /اطلب حساب كابتن/);
  assert.doesNotMatch(bar, /onOpenRegistration/);
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

  assert.match(clientPipeline, /MAX_WIDTH = 2200/);
  assert.match(clientPipeline, /MAX_HEIGHT = 3000/);
  assert.match(clientPipeline, /MAX_PIXELS = 5_000_000/);
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
  assert.match(storageAction, /ALLOWED_IMAGE_TYPES/);
  assert.match(storageAction, /صيغة الصورة غير مدعومة/);
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
  assert.match(clientPipeline, /failedFiles\.push\(originalFile\.name\)/);
  assert.match(clientPipeline, /await yieldToBrowser\(\)/);
  assert.match(
    adminActions,
    /serverApprovePendingRequest[\s\S]*catch \(error\)/,
  );
  assert.match(adminPage, /safeAdminQuery/);
});

test('new places wait for verified images and retry only failed files', () => {
  const clientPipeline = read('lib/images/client.ts');
  const storageAction = read('lib/supabase/actions.ts');
  const adminActions = read('lib/supabase/admin-actions.ts');
  const accountActions = read('lib/operations/actions.ts');
  const adminModal = read('components/admin/EditPlaceModal.tsx');
  const publicModal = read('components/modals/AddListingModal.tsx');

  assert.match(clientPipeline, /CLIENT_UPLOAD_ATTEMPTS = 2/);
  assert.match(clientPipeline, /image\/heic/);
  assert.match(clientPipeline, /sourceMimeType\(file\)/);
  assert.match(clientPipeline, /failures: Array/);
  assert.match(storageAction, /\.info\(data\.path\)/);
  assert.match(storageAction, /p_limit: 24/);
  assert.match(read('next.config.ts'), /img-src 'self' data: blob:/);

  const adminSubmit = adminModal.slice(adminModal.indexOf('const handleSubmit'));
  assert.ok(
    adminSubmit.indexOf('if (uploadResult.failedFiles.length)') <
      adminSubmit.indexOf('serverInsertPlaceDirectly({'),
  );
  assert.match(adminSubmit, /failedKeys\.has\(imageFileKey\(file\)\)/);
  assert.match(adminSubmit, /لم يتم حفظ المكان بدونها/);

  const publicSubmit = publicModal.slice(publicModal.indexOf('async function handleSubmit'));
  assert.ok(
    publicSubmit.indexOf('if (uploadResult.failedFiles.length)') <
      publicSubmit.indexOf('submitAccountRequest('),
  );
  assert.match(publicSubmit, /إعادة محاولة الصور الفاشلة فقط/);
  assert.match(adminActions, /uploadedImages\.length[\s\S]*أضف صورة واحدة على الأقل/);
  assert.match(accountActions, /data\.placeMode === 'new'[\s\S]*uploadedImages\.length === 0/);
});
