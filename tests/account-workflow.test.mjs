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

test('Google is the first step for merchant and driver applications', async () => {
  const actions = read('lib/operations/actions.ts');
  const signin = read('app/signin/page.tsx');
  const driverModal = read('components/delivery/DriverModal.tsx');
  const merchantModal = read('components/modals/AddListingModal.tsx');
  const directory = read('components/directory/DirectoryView.tsx');
  const { accountRequestSchema } = await import('../lib/operations/validation.ts');

  assert.match(actions, /identity\.provider === 'google'/);
  assert.match(actions, /\.eq\('auth_user_id', googleUser\.id\)/);
  assert.match(actions, /operationalProfile/);
  assert.match(signin, /if \(user\) redirect\(next\)/);
  assert.match(driverModal, /register%3Ddriver/);
  assert.match(merchantModal, /register%3Dplace/);
  assert.match(directory, /cat === 'stores'[\s\S]{0,260}router\.push\('\/marketplace'\)/);
  assert.equal(accountRequestSchema.parse({
    kind: 'driver',
    displayName: 'كابتن تجريبي',
    phone: '01008747011',
    whatsapp: '01008747011',
  }).password, '');
});

test('select options submit stable values and legacy labels are normalized', async () => {
  const merchantModal = read('components/modals/AddListingModal.tsx');
  const userEditor = read('components/admin/UserEditorModal.tsx');
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
  assert.match(userEditor, /<ListBox\.Item id="admin" textValue="أدمن"/);
  assert.match(
    userEditor,
    /<ListBox\.Item key=\{merchant\.id\} id=\{merchant\.id\}/,
  );
  assert.match(userEditor, /from '@heroui\/react\/select'/);
  assert.doesNotMatch(userEditor, /heroui-compat/);
  assert.match(operations, /operations_action_validation_failed/);

  assert.equal(listingCategorySchema.parse('pharmacy'), 'pharmacy');
  assert.equal(listingCategorySchema.parse('صيدليات وطب'), 'pharmacy');
  assert.equal(listingCategorySchema.parse('💊 صيدليات وطب'), 'pharmacy');
  assert.equal(listingCategorySchema.parse('متجر'), 'stores');
  assert.equal(listingCategorySchema.parse('🛍️ متجر'), 'stores');
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
    /isSelected[\s\S]{0,180}\? 'border-zinc-950 bg-zinc-950 text-white shadow-\[/,
  );
  assert.match(categoryBar, /grid-cols-4/);
  assert.match(categoryBar, /h-16/);
  assert.match(categoryBar, /sm:h-\[116px\]/);
  assert.match(categoryBar, /aria-pressed=\{isSelected\}/);
  assert.match(categoryBar, /filter\(\(cat\) => cat\.id !== 'all'\)/);
  assert.match(categoryBar, /isSelected \? 'all' : cat\.id/);
  assert.match(merchantModal, /kayan-account-mode-tab/);
  assert.match(
    globalStyles,
    /\.kayan-account-mode-tab\[aria-selected='true'\]\s*\{[\s\S]*color:\s*#fff\s*!important/,
  );
  assert.doesNotMatch(categoryBar, /transition-all/);
});

test('public branding uses DAIRTAK consistently', () => {
  const brand = read('lib/brand.ts');
  const brandLogo = read('components/layout/BrandLogo.tsx');
  const marketplaceShell = read('components/marketplace/marketplace-shell.tsx');
  const services = read('app/services/page.tsx');
  const manifest = read('public/manifest.json');
  const serviceWorker = read('public/sw.js');
  const publicFiles = [
    'app/layout.tsx',
    'app/services/page.tsx',
    'app/guide/page.tsx',
    'app/share/page.tsx',
    'components/marketplace/marketplace-shell.tsx',
    'components/auth/LoginForm.tsx',
    'components/operations/DashboardHeader.tsx',
  ];

  assert.match(brand, /export const SITE_NAME = 'DAIRTAK';/);
  assert.match(manifest, /"name": "DAIRTAK",/);
  assert.match(serviceWorker, /DAIRTAK/);
  assert.match(brandLogo, /src: '\/brand\/dairtak-logo\.svg'/);
  assert.match(marketplaceShell, /aria-label="DAIRTAK — العودة إلى الصفحة الرئيسية"/);
  assert.match(marketplaceShell, /<BrandLogo variant="full"/);
  assert.match(services, /دليل الخدمات المحلية/);

  for (const file of publicFiles) {
    assert.doesNotMatch(read(file), /خدمات الكيان|كيان هب|Kayan Hub|KayanHub/);
  }
});

test('active public routes keep support and sharing inside the site', () => {
  const layout = read('app/layout.tsx');
  const installer = read('components/layout/PwaInstaller.tsx');
  const installExperience = read('components/layout/PwaInstallExperience.tsx');
  const activePublicSurfaces = [
    'app/layout.tsx',
    'app/services/page.tsx',
    'app/guide/page.tsx',
    'app/share/page.tsx',
    'components/marketing/PublicShareHub.tsx',
  ];

  assert.match(layout, /<PwaInstaller \/>/);
  assert.match(layout, /telephone: false/);
  assert.doesNotMatch(layout, /WhatsAppGroupButton|WHATSAPP_GROUP_URL/);
  for (const file of activePublicSurfaces) {
    assert.doesNotMatch(
      read(file),
      /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)|href=\{?[`'"]tel:/i,
      `${file} must not expose an external messaging or click-to-call shortcut`,
    );
  }
  assert.match(read('components/marketing/PublicShareHub.tsx'), /navigator\.share/);
  assert.match(read('components/marketing/PublicShareHub.tsx'), /حدّد النص التالي وانسخه من داخل الموقع/);
  assert.match(
    installExperience,
    /bottom-\[calc\(5\.5rem\+env\(safe-area-inset-bottom\)\)\][\s\S]*sm:bottom-4/,
  );
});

test('driver contact data stays operational and is not exposed as a public action', () => {
  const workspace = read('components/operations/DriverWorkspace.tsx');
  const adminManager = read('components/admin/DriverManager.tsx');
  const services = read('app/services/page.tsx');

  assert.match(workspace, /name="contactPhone"/);
  assert.match(workspace, /رقم التواصل محفوظ لفريق التشغيل ولا يظهر في دليل الكباتن العام/);
  assert.doesNotMatch(workspace, /\{order\.recipient_phone\}/);
  assert.match(adminManager, />رقم التشغيل الداخلي<\/Label>/);
  assert.match(adminManager, /لا يظهر في الدليل العام/);
  assert.doesNotMatch(adminManager, /href=\{?[`'"]tel:|wa\.me|api\.whatsapp\.com/i);
  assert.doesNotMatch(services, /item\.phone|href=\{?[`'"]tel:|wa\.me|api\.whatsapp\.com/i);
});

test('legacy role dashboards expose the marketplace journey', () => {
  const admin = read('components/operations/AdminWorkspace.tsx');
  const driver = read('components/operations/DriverWorkspace.tsx');
  const merchant = read('components/operations/MerchantOrderWorkspace.tsx');

  assert.match(admin, /href="\/admin\/marketplace\/orders"/);
  assert.match(driver, /href="\/driver\/marketplace"/);
  assert.match(merchant, /href="\/merchant\/marketplace"/);
});

test('drivers can manage a safe public avatar from their dashboard', () => {
  const actions = read('lib/operations/actions.ts');
  const workspace = read('components/operations/DriverWorkspace.tsx');
  const card = read('components/delivery/DriverCard.tsx');
  const migration = read(
    'supabase/migrations/20260810080000_move_active_legacy_media_to_spaces.sql',
  );

  assert.match(actions, /export async function updateDriverAvatar/);
  assert.match(actions, /await requireRole\('driver'\)/);
  assert.match(actions, /processAvatarForStorage/);
  assert.match(actions, /writePrivateMediaObject/);
  assert.match(actions, /writePublicMediaObject/);
  assert.match(actions, /replace_my_driver_avatar_media/);
  assert.match(workspace, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(workspace, /تغيير صورة الكابتن|إضافة صورة الكابتن/);
  assert.match(card, /src=\{driver\.avatar_url \|\| undefined\}/);
  assert.match(card, /rounded-\[24px\] border border-zinc-200 bg-white/);
  assert.match(card, /rounded-\[18px\] bg-zinc-50/);
  assert.match(migration, /purpose in \('place', 'driver_avatar'\)/);
  assert.match(migration, /update public\.driver_profiles/);
  assert.match(migration, /media\.delete_requested/);
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
  assert.match(clientPipeline, /file\.size <= SERVER_FALLBACK_BYTES[\s\S]*SERVER_FALLBACK_TYPES\.has/u);
  assert.match(clientPipeline, /image\/webp/);
  assert.match(clientPipeline, /imageSmoothingQuality = 'high'/);
  assert.match(serverPipeline, /\.rotate\(\)/);
  assert.match(serverPipeline, /\.sharpen\(\{ sigma: 0\.45 \}\)/);
  assert.match(serverPipeline, /\.webp\(\{/);
  assert.match(serverPipeline, /PASSTHROUGH_WEBP_BYTES/);
  assert.match(serverPipeline, /source\.format === 'webp'/);
  assert.match(storageAction, /createPrivateStageUpload/);
  assert.match(storageAction, /checksumSha256/);
  assert.match(storageAction, /requiredHeaders/);
  assert.match(storageAction, /صيغة الصورة غير مدعومة/);
  assert.match(clientPipeline, /method: 'PUT'/);
  assert.match(clientPipeline, /\/api\/legacy-media\/uploads/);
  assert.match(clientPipeline, /MAX_PREPARED_UPLOAD_BYTES/);
  assert.match(clientPipeline, /canvasToJpeg/);
  assert.match(clientPipeline, /crypto\.subtle\.digest\('SHA-256'/);
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
    /storage_upload_preparation_failed[\s\S]*success: false/,
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
  const finalizeAction = read('app/api/legacy-media/uploads/[id]/finalize/route.ts');
  assert.match(finalizeAction, /headPrivateMediaObject/);
  assert.match(finalizeAction, /sourceHash !== row\.expected_sha256/);
  assert.match(storageAction, /p_limit: 24/);
  const imageConfig = read('next.config.ts');
  assert.match(imageConfig, /const imageSources = \[/);
  assert.match(imageConfig, /'https:\/\/\*\.digitaloceanspaces\.com'/);
  assert.match(imageConfig, /img-src \$\{imageSources\}/);

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
  assert.match(adminActions, /pendingImages\.uploadIds\.length[\s\S]*أضف صورة واحدة على الأقل/);
  assert.match(accountActions, /data\.placeMode === 'new'[\s\S]*uploadedImages\.length === 0/);
});
