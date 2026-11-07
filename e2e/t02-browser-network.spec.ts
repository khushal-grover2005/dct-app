import { test, expect } from '@playwright/test';

test.describe('Acceptance Test T-02: Browser Gate and Air-Gapped Network Verification', () => {
  test('T-02.1: CSP meta tag and preview server response headers enforce air-gapped directives', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);

    // 1. Verify HTTP Response Header (served by preview/dev server)
    const headers = response!.headers();
    const cspHeader = headers['content-security-policy'];
    if (cspHeader) {
      expect(cspHeader).toContain("connect-src 'none'");
      expect(cspHeader).toContain("default-src 'self'");
      expect(cspHeader).toContain("img-src 'self' blob:");
      expect(cspHeader).toContain("media-src blob:");
      expect(cspHeader).toContain("frame-src blob:");
      expect(cspHeader).toContain("object-src 'none'");
      expect(cspHeader).toContain("script-src 'self'");
      expect(cspHeader).toContain("style-src 'self' 'unsafe-inline'");
    }

    // 2. Verify <meta http-equiv="Content-Security-Policy"> in document head
    const metaCsp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(metaCsp).not.toBeNull();
    expect(metaCsp).toContain("connect-src 'none'");
    expect(metaCsp).toContain("default-src 'self'");
    expect(metaCsp).toContain("img-src 'self' blob:");
    expect(metaCsp).toContain("media-src blob:");
    expect(metaCsp).toContain("frame-src blob:");
    expect(metaCsp).toContain("object-src 'none'");
    expect(metaCsp).toContain("script-src 'self'");
    expect(metaCsp).toContain("style-src 'self' 'unsafe-inline'");
  });

  test('T-02.2: Zero external network requests during initial load and lifecycle', async ({ page }) => {
    const externalRequests: string[] = [];

    // Track all requests across page load
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        const host = url.hostname.replace(/^\[|\]$/g, '');
        if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
          externalRequests.push(request.url());
        }
      } catch {
        // Non-standard URLs (e.g. data:, blob:) are local
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify zero external network requests
    expect(externalRequests).toEqual([]);
  });

  test('T-02.3: Zero network requests recorded after page load', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const postLoadRequests: { url: string; method: string; resourceType: string }[] = [];

    // Attach request listener after page has settled
    page.on('request', (request) => {
      postLoadRequests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
      });
    });

    // Idle wait to confirm no polling / background beaconing occurs
    await page.waitForTimeout(1000);

    // Verify zero requests fired
    expect(postLoadRequests).toEqual([]);
  });

  test('T-02.4: Active CSP enforcement blocks outbound fetch requests', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Attempt a prohibited fetch request
    const fetchFailed = await page.evaluate(async () => {
      try {
        await fetch('https://example.com/api/test');
        return false;
      } catch {
        return true; // Expected: fetch is blocked by CSP
      }
    });

    expect(fetchFailed).toBe(true);
  });

  test('T-02.5: In Firefox, shows only the Chrome/Edge requirement screen (R-05)', async ({ page, browserName }) => {
    test.skip(browserName !== 'firefox', 'This test specifically validates Firefox without FSA API');

    await page.goto('/');

    const gateCard = page.locator('#browser-gate-unsupported');
    await expect(gateCard).toBeVisible();

    const expectedText =
      'This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.';
    await expect(gateCard).toHaveText(expectedText);

    // Verify "and nothing else" constraint: no shell, no buttons, no inputs
    await expect(page.locator('#app-shell')).toHaveCount(0);
    await expect(page.locator('button, input, select, textarea, a')).toHaveCount(0);
  });

  test('T-02.6: In Chromium, renders the app shell and unsupported screen is not shown', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'This test specifically validates Chromium with FSA API');

    await page.goto('/');

    // 1. Assert unsupported screen is NOT present
    await expect(page.locator('#browser-gate-unsupported')).toHaveCount(0);

    // 2. Assert App shell is rendered
    await expect(page.locator('#app-shell')).toBeVisible();
    await expect(page.getByText('Data Collection Tool')).toBeVisible();
  });

  test('T-02.7: Browser Gate fallback simulation when FSA API is deleted', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'FSA deletion simulation is specific to supported browsers');

    // Simulate unsupported browser in Chromium by removing window.showDirectoryPicker
    await page.addInitScript(() => {
      // @ts-expect-error delete for simulation
      delete window.showDirectoryPicker;
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const gateCard = page.locator('#browser-gate-unsupported');
    await expect(gateCard).toBeVisible();
    await expect(gateCard).toHaveText(
      'This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.'
    );

    // Verify app shell is NOT visible
    await expect(page.locator('#app-shell')).not.toBeVisible();
  });

  test('T-02.8: Browser Gate fallback simulation when accessing FSA API throws an exception', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Throwing property simulation is evaluated on Chromium');

    // Simulate throwing getter (e.g. security policy or restricted sandbox error)
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', {
        configurable: true,
        get() {
          throw new Error('SecurityError: Access to File System Access API is restricted by policy.');
        },
      });
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const gateCard = page.locator('#browser-gate-unsupported');
    await expect(gateCard).toBeVisible();
    await expect(gateCard).toHaveText(
      'This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.'
    );

    // Verify app shell is NOT visible and zero functional elements leak
    await expect(page.locator('#app-shell')).not.toBeVisible();
    await expect(page.locator('button, input, select, textarea, a')).toHaveCount(0);
  });
});

