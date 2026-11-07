import { chromium } from 'playwright';

async function runPlaywrightStress() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Testing Playwright E2E Corner Cases...');

  // 1. Throwing getter test
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      get() {
        throw new Error('DOMException: SecurityError: Access to File System Access API denied');
      },
    });
  });

  const pageErrors = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  await page.goto('http://127.0.0.1:4173');
  await page.waitForTimeout(2000);

  const gateCard = page.locator('#browser-gate-unsupported');
  const gateVisible = await gateCard.isVisible().catch(() => false);
  const appShellVisible = await page.locator('#app-shell').isVisible().catch(() => false);

  console.log(`[E2E RESULT] Throwing getter:`);
  console.log(`  pageErrors: ${JSON.stringify(pageErrors)}`);
  console.log(`  gateVisible: ${gateVisible}`);
  console.log(`  appShellVisible: ${appShellVisible}`);

  await browser.close();
}

runPlaywrightStress().catch((err) => {
  console.error('Playwright stress test failed:', err);
  process.exit(1);
});
