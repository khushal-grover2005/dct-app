import { chromium } from '@playwright/test';

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.route('http://localhost:5173/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: {
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'none'",
      },
      body: `<!doctype html><html><body><h1>Secure Context Test</h1></body></html>`,
    });
  });

  await page.goto('http://localhost:5173/');

  const result = await page.evaluate(async () => {
    try {
      const wasmBytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
      await WebAssembly.compile(wasmBytes);
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message, name: err.name };
    }
  });

  console.log('WebAssembly in Secure Context with script-src self:', JSON.stringify(result));
  await browser.close();
}

run().catch(console.error);
