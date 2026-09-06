import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// This suite uses genuine signed-out routes/data, not an invented authenticated
// session. Full Google onboarding and uploads require configured external services.
const widths = [360, 390, 768, 1440];

async function assertUsablePage(page: Page) {
  await expect(page.locator('#main-content')).toBeVisible();
  await expect(page.getByText('تعذر تحميل المتجر', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
}

async function assertAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
}

async function openFilters(page: Page, width: number) {
  if (width < 768) {
    await page.getByRole('button', { name: /^تصفية المنتجات/u }).click();
    const dialog = page.getByRole('dialog', { name: 'تصفية نتائج المنتجات' });
    await expect(dialog).toBeVisible();
    return dialog.getByRole('search');
  }
  return page.getByRole('complementary', { name: 'تصفية المنتجات' }).getByRole('search');
}

for (const width of widths) {
  test.describe(`shared identity ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
    });
    test.setTimeout(60_000);

    test('main site opens its integrated marketplace with the same header and accessible layout', async ({ page }, testInfo) => {
      const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto('/');
      await assertUsablePage(page);
      const header = page.getByRole('navigation', { name: 'التنقل الرئيسي', exact: true });
      const originalLogo = await header.locator('img').first().getAttribute('src');
      const originalHeaderHeight = (await header.boundingBox())?.height;
      await page.screenshot({ path: testInfo.outputPath(`main-${width}.png`), fullPage: true });
      if (width < 768) {
        await page.getByRole('button', { name: 'فتح قائمة الموقع' }).click();
        await page.getByRole('dialog', { name: 'قائمة الموقع', exact: true }).getByRole('link', { name: 'متجر ديرتك' }).click();
      } else {
        await header.getByRole('link', { name: 'المتجر', exact: true }).click();
      }
      await expect(page).toHaveURL(/\/marketplace$/u);
      await expect(page.getByRole('heading', { name: 'اكتشف منتجات من متاجر منطقتك' })).toBeVisible();
      await assertUsablePage(page);
      await expect(header.locator('img').first()).toHaveAttribute('src', originalLogo!);
      expect((await header.boundingBox())?.height).toBe(originalHeaderHeight);
      const sidebar = page.getByRole('complementary', { name: 'تصفية المنتجات' });
      if (width >= 768) await expect(sidebar).toBeVisible();
      else await expect(sidebar).toBeHidden();
      expect(await page.locator('.dairtak-theme').first().evaluate(el => getComputedStyle(el).getPropertyValue('--dairtak-card-radius').trim())).toBe('1.5rem');
      await assertAccessible(page);
      await page.screenshot({ path: testInfo.outputPath(`catalog-${width}.png`), fullPage: true });
      expect(pageErrors).toEqual([]);
    });

    test('sidebar or drawer submits real GET filters and restores them on browser Back', async ({ page }, testInfo) => {
      await page.goto('/marketplace?q=existing&min_price=10&rating=3&sort=price_asc');
      let filters = await openFilters(page, width);
      await expect(filters.getByRole('searchbox')).toHaveValue('existing');
      await filters.getByRole('searchbox').fill('اختبار منتج غير موجود');
      await filters.locator('input[name="min_price"]').fill('25');
      const ratingTrigger = filters.getByRole('button', { name: /الحد الأدنى للتقييم/u });
      await ratingTrigger.scrollIntoViewIfNeeded();
      await ratingTrigger.click();
      await expect(page.getByRole('listbox', { name: 'الحد الأدنى للتقييم' })).toBeVisible();
      await page.getByRole('option', { name: '4 نجوم فأكثر' }).click();
      await expect(filters.locator('input[name="rating"][type="hidden"]')).toHaveValue('4');
      await assertAccessible(page);
      await page.screenshot({ path: testInfo.outputPath(`filters-${width}.png`), fullPage: true });
      await filters.getByRole('button', { name: 'تطبيق الفلاتر' }).click();
      if (width < 768) {
        await expect(page.getByRole('dialog', { name: 'تصفية نتائج المنتجات' })).toBeHidden();
      }
      await expect(page).toHaveURL(/min_price=25/u);
      expect(new URL(page.url()).searchParams.get('q')).toBe('اختبار منتج غير موجود');
      expect(new URL(page.url()).searchParams.get('rating')).toBe('4');
      await assertUsablePage(page);
      await page.getByRole('navigation', { name: 'أقسام المتجر' }).getByRole('link', { name: 'السلة', exact: true }).click();
      await expect(page).toHaveURL(/\/marketplace\/cart$/u);
      await page.goBack();
      await expect(page).toHaveURL(/min_price=25/u);
      filters = await openFilters(page, width);
      await expect(filters.getByRole('searchbox')).toHaveValue('اختبار منتج غير موجود');
      await expect(filters.locator('input[name="min_price"]')).toHaveValue('25');
      await expect(filters.locator('input[name="rating"][type="hidden"]')).toHaveValue('4');

      // Test clear all inside drawer/sidebar closes drawer and clears URL
      const clearLink = filters.getByRole('link', { name: 'مسح الكل' });
      await clearLink.click();
      await expect(page).toHaveURL(/\/marketplace$/u);
      if (width < 768) {
        await expect(page.getByRole('dialog', { name: 'تصفية نتائج المنتجات' })).toBeHidden();
      }

      // Test browser Back restores previous filtered state and form values
      await page.goBack();
      await expect(page).toHaveURL(/min_price=25/u);
      filters = await openFilters(page, width);
      await expect(filters.getByRole('searchbox')).toHaveValue('اختبار منتج غير موجود');
      await expect(filters.locator('input[name="min_price"]')).toHaveValue('25');
      if (width < 768) {
        await page.getByRole('button', { name: 'إغلاق نافذة التصفية' }).click();
        await expect(page.getByRole('dialog', { name: 'تصفية نتائج المنتجات' })).toBeHidden();
        await expect(page.getByRole('button', { name: /^تصفية المنتجات/u })).toBeFocused();
      }
    });

    test('empty cart is usable and does not expose an anonymous order form', async ({ page }, testInfo) => {
      await page.goto('/marketplace/cart');
      await expect(page.getByRole('heading', { name: 'سلتك فارغة' })).toBeVisible();
      await assertUsablePage(page);
      await assertAccessible(page);
      await page.screenshot({ path: testInfo.outputPath(`cart-${width}.png`), fullPage: true });
      await page.goto('/marketplace/checkout');
      await expect(page.getByRole('heading', { name: 'لا يوجد طلب لإتمامه' })).toBeVisible();
      await expect(page.locator('form input[name="phone"]')).toHaveCount(0);
      await assertUsablePage(page);
    });

    test('anonymous onboarding returns to Google sign-in without public password fields', async ({ page }, testInfo) => {
      await page.goto('/onboarding?activity=store');
      await expect(page).toHaveURL(/\/signin\?next=%2Fonboarding$/u);
      await expect(page.getByRole('heading', { name: 'دخول واحد لكل ديرتك' })).toBeVisible();
      const google = page.getByRole('button', { name: 'المتابعة باستخدام Google' });
      await expect(google).toBeVisible();
      expect((await google.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await expect(page.locator('input[type="password"]')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'الحسابات القديمة والإدارة' })).toHaveAttribute('href', '/login');
      await assertUsablePage(page);
      await assertAccessible(page);
      await page.screenshot({ path: testInfo.outputPath(`signin-${width}.png`), fullPage: true });
      // Deliberately do not initiate OAuth: the provider is disabled in Staging.
    });
  });
}
