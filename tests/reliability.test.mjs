import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('the root keeps the directory deterministic and links into the marketplace', () => {
  const driverCard = read('components/delivery/DriverCard.tsx');
  const page = read('app/page.tsx');
  const directory = read('components/directory/DirectoryView.tsx');
  const marketplaceEntry = read('components/directory/MarketplaceEntry.tsx');
  const marketplaceShell = read('components/marketplace/marketplace-shell.tsx');
  assert.match(driverCard, /useState\(renderedAt\)/);
  assert.doesNotMatch(driverCard, /useState\(\(\) => Date\.now\(\)\)/);
  assert.match(page, /await fetchHomePageData\(\)/);
  assert.match(page, /<DirectoryView/);
  assert.match(page, /renderedAt=\{renderedAt\}/);
  assert.match(directory, /<MarketplaceEntry/);
  assert.match(marketplaceEntry, /href="\/marketplace"/);
  assert.match(marketplaceEntry, /motion-reduce:/);
  assert.match(marketplaceShell, /<BrandLogo variant="full"/);
  assert.match(marketplaceShell, /href: '\/'/);
  assert.doesNotMatch(page, /redirect\(/);
});

test('mobile navigation uses the HeroUI v3 drawer from the physical left edge', () => {
  const header = read('components/layout/Header.tsx');
  assert.match(header, /from '@heroui\/react\/drawer'/);
  assert.match(header, /<Drawer\.Content[\s\S]{0,180}placement="left"[\s\S]{0,180}\[direction:ltr\]/);
  assert.match(header, /<Drawer\.Dialog[\s\S]{0,180}dir="rtl"/);
  assert.match(header, /rounded-r-\[28px\]/);
  assert.match(header, /bg-zinc-950 text-white/);
  assert.match(header, /aria-label="إغلاق القائمة"/);
  assert.match(header, /href="\/marketplace"/);
  assert.match(header, /متجر ديرتك/);
});

test('admin navigation covers overview, revenue, activity, publishing, and mobile drawer access', () => {
  const workspace = read('components/operations/AdminWorkspace.tsx');
  const page = read('app/admin/page.tsx');
  assert.match(workspace, /key: 'overview', label: 'نظرة عامة'/);
  assert.match(workspace, /key: 'revenue', label: 'الإيرادات والتحصيل'/);
  assert.match(workspace, /key: 'activity', label: 'النشاط والأداء'/);
  assert.match(workspace, /key: 'marketing', label: 'التسويق والنشر'/);
  assert.match(workspace, /أقسام لوحة التحكم/);
  assert.match(workspace, /<Drawer\.Content placement="left" className="[^"]*\[direction:ltr\]/);
  assert.match(page, /collection_amount, delivery_fee/);
});

test('the active services directory has server search, filters, pagination, and private contacts', () => {
  const services = read('app/services/page.tsx');
  const queries = read('lib/services/queries.ts');

  assert.match(services, /await fetchPublicServices\(\{ category, page, query \}\)/);
  assert.match(services, /<form role="search"[\s\S]{0,180}action="\/services"/);
  assert.match(services, /name="q"/);
  assert.match(services, /aria-label="تصنيفات الخدمات"/);
  assert.match(services, /aria-label="صفحات النتائج"/);
  assert.match(services, /href="\/marketplace"/);
  assert.match(services, /id="main-content"/);
  assert.doesNotMatch(services, /item\.phone|item\.whatsapp|href=\{?[`'"]tel:|wa\.me|api\.whatsapp\.com/i);
  assert.match(queries, /\.range\(from, to\)/);
  assert.match(queries, /\.ilike\('title'/);
});

test('place details are deep-linked through Next navigation without patching browser history', () => {
  const directory = read('components/directory/DirectoryView.tsx');
  assert.match(directory, /params\.set\('place', placeId\)/);
  assert.match(directory, /البطاقة المطلوبة غير موجودة/);
  assert.match(directory, /router\.replace\(removePlaceFromUrl\(\)/);
  assert.match(directory, /function closeDetails[\s\S]{0,500}router\.replace\(cleanUrl/);
  assert.doesNotMatch(directory, /router\.back\(\)|History\.prototype|window\.history\.(?:pushState|replaceState)/);
});

test('store coupons are public-read-only and redeem inside the marketplace', () => {
  const migration = read('supabase/migrations/20260801080152_add_store_coupons.sql');
  const offer = read('components/directory/CouponOffer.tsx');
  const manager = read('components/admin/CouponManager.tsx');
  assert.match(migration, /alter table public\.store_coupons enable row level security/);
  assert.match(migration, /grant select on public\.store_coupons to anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on public\.store_coupons to service_role/);
  assert.match(migration, /'KAYAN10'/);
  assert.match(migration, /where p\.title = 'أكل بيتي مميز'/);
  assert.match(offer, /استخدم الكود داخل سلة الموقع/);
  assert.match(offer, /href="\/marketplace"/);
  assert.doesNotMatch(offer, /whatsAppMessage|wa\.me|api\.whatsapp\.com|href=\{?[`'"]tel:/i);
  assert.match(manager, /serverUpsertStoreCoupon/);
});

test('all modals render in a body portal and coupons stay viewport-bound', () => {
  const compatibilityLayer = read('components/ui/heroui-compat.tsx');
  const couponOffer = read('components/directory/CouponOffer.tsx');
  const globalStyles = read('app/globals.css');

  assert.match(compatibilityLayer, /createPortal\(/);
  assert.match(compatibilityLayer, /document\.body/);
  assert.match(compatibilityLayer, /data-kayan-portal="modal"/);
  assert.match(couponOffer, /max-h-\[min\(88dvh,720px\)\]/);
  assert.match(globalStyles, /\.kayan-modal-wrapper[\s\S]{0,180}position:\s*fixed\s*!important/);
});

test('store category follows restaurants and supports product-focused listings', () => {
  const constants = read('lib/constants.ts');
  const validation = read('lib/operations/validation.ts');
  const migration = read('supabase/migrations/20260801110838_add_store_directory_category.sql');
  const merchantModal = read('components/modals/AddListingModal.tsx');

  assert.match(constants, /id: 'restaurants'[\s\S]{0,260}id: 'stores'/);
  assert.match(constants, /label: 'متجر'/);
  assert.match(validation, /'stores'/);
  assert.match(migration, /place_category in \([\s\S]*'stores'/);
  assert.match(merchantModal, /أشهر الماركات، نطاق الأسعار/);
});

test('native public sharing has an in-site copy fallback without contact leakage', () => {
  const shareHub = read('components/marketing/PublicShareHub.tsx');
  assert.match(shareHub, /navigator\.share\(\{ title: item\.title, text \}\)/);
  assert.match(shareHub, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(shareHub, /readOnly[\s\S]{0,120}value=\{text\}/);
  assert.match(shareHub, /حدّد النص التالي وانسخه من داخل الموقع/);
  assert.doesNotMatch(shareHub, /fallbackWhatsApp|wa\.me|api\.whatsapp\.com|place\.phone|driver\.phone/i);
});

test('verified merchants update their linked place directly while public suggestions stay moderated', () => {
  const operations = read('lib/operations/actions.ts');
  const publicActions = read('lib/supabase/actions.ts');
  assert.match(operations, /action: 'merchant_place_updated'/);
  assert.match(operations, /\.from\('places'\)[\s\S]*whatsapp_group_url/);
  assert.doesNotMatch(operations, /merchant_change_request_created/);
  assert.match(publicActions, /feedback_type: feedbackType/);
  assert.match(publicActions, /status: 'pending'/);
});

test('restricted browser storage cannot crash common public components', () => {
  for (const file of [
    'components/layout/PwaInstallExperience.tsx',
    'components/directory/UpvoteButton.tsx',
    'hooks/useFavorites.ts',
  ]) {
    const source = read(file);
    assert.match(source, /try\s*\{/);
    assert.match(source, /localStorage/);
    assert.match(source, /catch\s*\{/);
  }
});

test('analytics, speed insights, and anonymous diagnostics are mounted once', () => {
  const layout = read('app/layout.tsx');
  assert.match(layout, /<Analytics \/>/);
  assert.match(layout, /<SpeedInsights \/>/);
  assert.match(layout, /<ClientErrorReporter release=\{release\} \/>/);
});

test('auth proxy does not run on the cached public directory', () => {
  const proxy = read('proxy.ts');
  assert.ok(proxy.includes("'/admin/:path*'"));
  assert.ok(proxy.includes("'/merchant/:path*'"));
  assert.ok(!proxy.includes("matcher: ['/']"));
});

test('database migration keeps diagnostics private and storage writes server-only', () => {
  const migration = read(
    'supabase/migrations/202607280001_place_details_reliability.sql',
  );
  const postDeploy = read(
    'supabase/migrations/202607280002_revoke_legacy_privileges.sql',
  );
  assert.match(migration, /alter table public\.client_error_reports enable row level security/);
  assert.match(migration, /revoke all on public\.client_error_reports from anon, authenticated/);
  assert.doesNotMatch(migration, /drop policy if exists "public submit directory media"/);
  assert.match(postDeploy, /drop policy if exists "public submit directory media"/);
  assert.match(postDeploy, /grant execute on function %s to authenticated/);
  assert.match(migration, /grant execute on function public\.record_client_error/);
});

test('driver operational contact stays managed without becoming a public shortcut', () => {
  const migration = read(
    'supabase/migrations/20260729115854_driver_contact_and_pwa_reliability.sql',
  );
  const workspace = read('components/operations/DriverWorkspace.tsx');
  const adminManager = read('components/admin/DriverManager.tsx');
  const services = read('app/services/page.tsx');

  assert.match(migration, /add column if not exists contact_phone text/);
  assert.match(migration, /coalesce\(driver\.contact_phone, legacy\.phone, profile\.phone\)/);
  assert.match(migration, /admin_update_managed_driver/);
  assert.match(migration, /to service_role/);
  assert.match(workspace, /name="contactPhone"/);
  assert.match(workspace, /رقم التواصل محفوظ لفريق التشغيل ولا يظهر في دليل الكباتن العام/);
  assert.doesNotMatch(workspace, /\{order\.recipient_phone\}/);
  assert.match(adminManager, /رقم التشغيل الداخلي/);
  assert.match(adminManager, /لا يظهر في الدليل العام/);
  assert.doesNotMatch(adminManager, /wa\.me|api\.whatsapp\.com|href=\{?[`'"]tel:/i);
  assert.doesNotMatch(services, /item\.phone|item\.whatsapp|href=\{?[`'"]tel:/i);
});

test('login resolution is server-side and can repair an incomplete driver link', () => {
  const loginForm = read('components/auth/LoginForm.tsx');
  const authActions = read('lib/auth/actions.ts');
  const migration = read(
    'supabase/migrations/20260729133447_repair_driver_account_activation.sql',
  );
  const adminManager = read('components/admin/DriverManager.tsx');

  assert.match(loginForm, /loginWithPhone/);
  assert.doesNotMatch(loginForm, /\.from\('profiles'\)/);
  assert.match(authActions, /signInWithPassword/);
  assert.match(authActions, /\.from\('driver_profiles'\)[\s\S]*\.insert\(/);
  assert.match(migration, /admin_repair_driver_account/);
  assert.match(migration, /on conflict \(profile_id\) do nothing/);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(adminManager, /تنشيط وربط الحساب/);
});

test('post-mutation refresh failures do not turn committed writes into errors', () => {
  const safeRevalidate = read('lib/cache/safe-revalidate.ts');
  const operations = read('lib/operations/actions.ts');
  const driverWorkspace = read('components/operations/DriverWorkspace.tsx');
  const adminWorkspace = read('components/operations/AdminWorkspace.tsx');

  assert.match(safeRevalidate, /Cache refresh is best-effort after a committed mutation/);
  assert.doesNotMatch(operations, /\brevalidatePath\(/);
  assert.match(operations, /approved_account_metadata_update_deferred/);
  assert.match(driverWorkspace, /transport failed/);
  assert.match(adminWorkspace, /recoverFromActionError/);
});

test('PWA caches only public shell data and provides an iOS-safe install path', () => {
  const serviceWorker = read('public/sw.js');
  const installer = read('components/layout/PwaInstaller.tsx');
  const installExperience = read('components/layout/PwaInstallExperience.tsx');
  const manifest = read('public/manifest.json');
  const layout = read('app/layout.tsx');
  const nextConfig = read('next.config.ts');

  for (const privatePrefix of ['/account', '/admin', '/driver', '/merchant', '/login', '/marketplace/cart', '/marketplace/checkout', '/marketplace/orders']) {
    assert.match(serviceWorker, new RegExp(`'${privatePrefix.replaceAll('/', '\\/')}'`));
  }
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(serviceWorker, /isNextDataRequest/);
  assert.match(serviceWorker, /offline\.html/);
  assert.match(serviceWorker, /dairtak-v2-notifications/);
  assert.match(serviceWorker, /event\.waitUntil\(self\.skipWaiting\(\)\)/);
  assert.match(installer, /INSTALL_ROUTES/);
  assert.match(installer, /dynamic\(/);
  assert.match(installExperience, /إضافة إلى الشاشة الرئيسية/);
  assert.match(installExperience, /updateViaCache: 'none'/);
  assert.match(installExperience, /SKIP_WAITING/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /apple-touch-icon|maskable/);
  assert.match(layout, /<PwaInstaller \/>/);
  assert.match(nextConfig, /Service-Worker-Allowed/);
  assert.match(nextConfig, /no-cache, no-store, must-revalidate/);
});
