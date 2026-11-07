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
      body: `<!doctype html><html><body><h1>Worker Crypto Test</h1></body></html>`,
    });
  });

  await page.goto('http://localhost:5173/');

  const result = await page.evaluate(async () => {
    try {
      const workerCode = `
        self.onmessage = async (e) => {
          try {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const hashBuffer = await self.crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            self.postMessage({ success: true, hash: hashHex });
          } catch (err) {
            self.postMessage({ success: false, message: err.message });
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));
      return await new Promise((resolve) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.postMessage('start');
      });
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  console.log('Worker Crypto on localhost:', JSON.stringify(result));
  await browser.close();
}

run().catch(console.error);
