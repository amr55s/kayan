import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('driver availability hydrates from a server-provided timestamp', () => {
  const driverCard = read('components/delivery/DriverCard.tsx');
  const page = read('app/page.tsx');
  assert.match(driverCard, /useState\(renderedAt\)/);
  assert.doesNotMatch(driverCard, /useState\(\(\) => Date\.now\(\)\)/);
  assert.match(page, /renderedAt/);
});

test('mobile navigation uses the HeroUI v3 drawer from the physical left edge', () => {
  const header = read('components/layout/Header.tsx');
  assert.match(header, /from '@heroui\/react\/drawer'/);
  assert.match(header, /<Drawer\.Content[\s\S]{0,180}placement="left"[\s\S]{0,180}\[direction:ltr\]/);
  assert.match(header, /<Drawer\.Dialog[\s\S]{0,180}dir="rtl"/);
  assert.match(header, /rounded-r-\[28px\]/);
  assert.match(header, /bg-zinc-950 text-white/);
  assert.match(header, /aria-label="إغلاق القائمة"/);
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

test('the public hero is actionable and remains anchored to directory search', () => {
  const directory = read('components/directory/DirectoryView.tsx');
  const categoryBar = read('components/directory/CategoryBar.tsx');
  const placeCard = read('components/directory/PlaceCard.tsx');
  const couponOffer = read('components/directory/CouponOffer.tsx');
  const deliveryBar = read('components/delivery/DeliveryBar.tsx');
  const driverCard = read('components/delivery/DriverCard.tsx');
  assert.match(directory, /كل اللي تحتاجه في كيان، في مكان واحد\./);
  assert.match(directory, /bg-zinc-950/);
  assert.doesNotMatch(directory, /FECF34/i);
  assert.match(directory, /id="directory-search"/);
  assert.match(directory, /<Input[\s\S]{0,400}value=\{searchQuery\}/);
  assert.match(directory, /inputWrapper: '[^']*!bg-white/);
  assert.match(directory, /placeholder:!text-zinc-500/);
  assert.match(directory, /hero_whatsapp_group/);
  assert.doesNotMatch(directory, /(?:amber|yellow|orange|emerald)-/);
  assert.doesNotMatch(placeCard, /(?:amber|yellow|orange)-/);
  assert.doesNotMatch(couponOffer, /(?:amber|yellow|orange|emerald)-/);
  assert.match(categoryBar, /CATEGORIES\.filter\(\(cat\) => cat\.id !== 'all'\)/);
  assert.match(categoryBar, /h-16/);
  assert.match(categoryBar, /bg-zinc-950 text-white/);
  assert.match(deliveryBar, /bg-zinc-950/);
  assert.match(deliveryBar, /sortedDrivers\.map/);
  assert.match(deliveryBar, /Number\(isConnected\(second\)\) - Number\(isConnected\(first\)\)/);
  assert.match(driverCard, /isAvailable &&/);
  assert.match(driverCard, />\s*متصل\s*</);
  assert.match(driverCard, /bg-zinc-950 text-xs font-black text-white/);
  assert.doesNotMatch(driverCard, /خامل|غير متاح/);
});

test('place details are deep-linked through Next navigation without patching browser history', () => {
  const directory = read('components/directory/DirectoryView.tsx');
  assert.match(directory, /params\.set\('place', placeId\)/);
  assert.match(directory, /البطاقة المطلوبة غير موجودة/);
  assert.match(directory, /router\.replace\(removePlaceFromUrl\(\)/);
  assert.match(directory, /function closeDetails[\s\S]{0,500}router\.replace\(cleanUrl/);
  assert.doesNotMatch(directory, /router\.back\(\)|History\.prototype|window\.history\.(?:pushState|replaceState)/);
});

test('store coupons are public-read-only and open a prefilled WhatsApp order', () => {
  const migration = read('supabase/migrations/20260801080152_add_store_coupons.sql');
  const offer = read('components/directory/CouponOffer.tsx');
  const manager = read('components/admin/CouponManager.tsx');
  assert.match(migration, /alter table public\.store_coupons enable row level security/);
  assert.match(migration, /grant select on public\.store_coupons to anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on public\.store_coupons to service_role/);
  assert.match(migration, /'KAYAN10'/);
  assert.match(migration, /where p\.title = 'أكل بيتي مميز'/);
  assert.match(offer, /استخدم الكوبون على واتساب/);
  assert.match(offer, /whatsAppMessage\(place, selected\)/);
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

test('native place sharing includes the direct URL only once', () => {
  const share = read('lib/share.ts');
  assert.match(share, /const text = `\$\{title\}\\n\$\{phone\}\\nعبر كيان سيتي سبوت`/);
  assert.match(share, /navigator\.share\(\{ title: .* text, url \}\)/);
  assert.match(share, /fallbackWhatsApp\(`\$\{text\}\\n\$\{url\}`\)/);
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
    'components/layout/PwaInstaller.tsx',
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

test('driver contact actions use a distinct managed field without exposing login data', () => {
  const migration = read(
    'supabase/migrations/20260729115854_driver_contact_and_pwa_reliability.sql',
  );
  const workspace = read('components/operations/DriverWorkspace.tsx');
  const adminManager = read('components/admin/DriverManager.tsx');
  const publicCard = read('components/delivery/DriverCard.tsx');

  assert.match(migration, /add column if not exists contact_phone text/);
  assert.match(migration, /coalesce\(driver\.contact_phone, legacy\.phone, profile\.phone\)/);
  assert.match(migration, /admin_update_managed_driver/);
  assert.match(migration, /to service_role/);
  assert.match(workspace, /name="contactPhone"/);
  assert.match(workspace, /pwa|بطاقتك|بيانات البطاقة العامة/i);
  assert.match(adminManager, /رقم الاتصال العام/);
  assert.doesNotMatch(publicCard, /driver\.phone\}/);
  assert.match(publicCard, /formatPhoneForTel\(driver\.phone\)/);
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
  assert.match(operations, /metadata update was deferred/);
  assert.match(driverWorkspace, /transport failed/);
  assert.match(adminWorkspace, /recoverFromActionError/);
});

test('PWA caches only public shell data and provides an iOS-safe install path', () => {
  const serviceWorker = read('public/sw.js');
  const installer = read('components/layout/PwaInstaller.tsx');
  const manifest = read('public/manifest.json');
  const layout = read('app/layout.tsx');
  const nextConfig = read('next.config.ts');

  assert.match(serviceWorker, /PRIVATE_PREFIXES = \['\/admin', '\/driver', '\/merchant', '\/login'\]/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(serviceWorker, /isNextDataRequest/);
  assert.match(serviceWorker, /offline\.html/);
  assert.match(serviceWorker, /kayan-v7-modal-portal-stores/);
  assert.match(serviceWorker, /event\.waitUntil\(self\.skipWaiting\(\)\)/);
  assert.match(installer, /إضافة إلى الشاشة الرئيسية/);
  assert.match(installer, /updateViaCache: 'none'/);
  assert.match(installer, /SKIP_WAITING/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /apple-touch-icon|maskable/);
  assert.match(layout, /<PwaInstaller \/>/);
  assert.match(nextConfig, /Service-Worker-Allowed/);
  assert.match(nextConfig, /no-cache, no-store, must-revalidate/);
});
