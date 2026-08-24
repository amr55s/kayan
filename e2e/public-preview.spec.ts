import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const publicRoutes = ['/marketplace', '/signin'];

for (const route of publicRoutes) {
  test(`${route} has a usable public shell and no serious axe violations`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response, `${route} did not return an HTTP response`).not.toBeNull();
    expect(response?.status(), `${route} returned an error response`).toBeLessThan(400);
    await expect(page.locator('#main-content')).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) =>
      violation.impact === 'critical' || violation.impact === 'serious'
    )).toEqual([]);
  });
}

test('the catalog keeps search and navigation inside the marketplace', async ({ page }) => {
  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response).not.toBeNull();
  await expect(page).toHaveURL(/\/(?:[?#]|$)/u);
  await expect(page.getByRole('search')).toBeVisible();
  await expect(page.locator('a[href^="tel:"], a[href*="wa.me"], a[href*="whatsapp.com"]')).toHaveCount(0);
});

test('Google sign-in is offered without starting an external OAuth mutation', async ({ page }) => {
  await page.goto('/signin', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Google/u })).toBeVisible();
});
