import { test, expect } from '@playwright/test';

test.describe('Adversarial E2E: Browser Capability Gate Corner Cases', () => {
  test('Corner Case: window.showDirectoryPicker is undefined', async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-expect-error test simulation
      window.showDirectoryPicker = undefined;
    });

    await page.goto('/');
    const gateCard = page.locator('#browser-gate-unsupported');
    await expect(gateCard).toBeVisible();
    await expect(gateCard).toHaveText(
      'This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.'
    );
    await expect(page.locator('#app-shell')).toHaveCount(0);
    await expect(page.locator('button, input, select, textarea, a')).toHaveCount(0);
  });

  test('Corner Case: window.showDirectoryPicker is null', async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-expect-error test simulation
      window.showDirectoryPicker = null;
    });

    await page.goto('/');
    const gateCard = page.locator('#browser-gate-unsupported');
    await expect(gateCard).toBeVisible();
    await expect(gateCard).toHaveText(
      'This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.'
    );
    await expect(page.locator('#app-shell')).toHaveCount(0);
    await expect(page.locator('button, input, select, textarea, a')).toHaveCount(0);
  });

  test('Corner Case: window.showDirectoryPicker is {} (not a function)', async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-expect-error test simulation
      window.showDirectoryPicker = {};
    });

    await page.goto('/');
    const gateCard = page.locator('#browser-gate-unsupported');
    await expect(gateCard).toBeVisible();
    await expect(gateCard).toHaveText(
      'This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.'
    );
    await expect(page.locator('#app-shell')).toHaveCount(0);
    await expect(page.locator('button, input, select, textarea, a')).toHaveCount(0);
  });

  test('Corner Case: accessing window.showDirectoryPicker throws an error', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', {
        configurable: true,
        get() {
          throw new Error('SecurityError: Access to File System Access API is restricted by policy.');
        },
      });
    });

    await page.goto('/');

    const gateCard = page.locator('#browser-gate-unsupported');
    const isGateVisible = await gateCard.isVisible().catch(() => false);

    console.log(`[E2E CORNER CASE] Accessing showDirectoryPicker throws error:`);
    console.log(`  pageErrors: ${JSON.stringify(pageErrors)}`);
    console.log(`  gateCard isVisible: ${isGateVisible}`);

    // If gateCard is not visible, it failed requirement 2
    expect(isGateVisible).toBe(true);
    await expect(gateCard).toHaveText(
      'This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.'
    );
    await expect(page.locator('#app-shell')).toHaveCount(0);
  });

  test('Corner Case: Simulated non-Chromium user agents (Safari / iOS)', async ({ page }) => {
    await page.addInitScript(() => {
      // Safari / iOS has no showDirectoryPicker
      // @ts-expect-error simulation
      delete window.showDirectoryPicker;
    });

    await page.goto('/');
    const gateCard = page.locator('#browser-gate-unsupported');
    await expect(gateCard).toBeVisible();
    await expect(gateCard).toHaveText(
      'This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.'
    );
    await expect(page.locator('#app-shell')).toHaveCount(0);
    await expect(page.locator('button, input, select, textarea, a')).toHaveCount(0);
  });

  test('Genuine FSA API: renders app shell cleanly without unsupported gate', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Genuine FSA test is for chromium');

    await page.goto('/');
    await expect(page.locator('#browser-gate-unsupported')).toHaveCount(0);
    await expect(page.locator('#app-shell')).toBeVisible();
    await expect(page.getByText('Data Collection Tool')).toBeVisible();
    await expect(page.getByText('Increment 1 Shell')).toBeVisible();
    await expect(page.getByText('Workspace Ready')).toBeVisible();
  });
});
