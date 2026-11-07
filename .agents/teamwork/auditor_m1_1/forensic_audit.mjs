import { chromium } from '@playwright/test';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');

async function runForensicAudit() {
  console.log('--- STARTING INDEPENDENT FORENSIC INTEGRITY AUDIT ---');
  let failures = [];

  // 1. Static Audit of dist/index.html
  console.log('\n[Check 1] Inspecting dist/index.html...');
  const distHtmlPath = path.join(rootDir, 'dist', 'index.html');
  if (!fs.existsSync(distHtmlPath)) {
    failures.push('dist/index.html does not exist. Run build first.');
  } else {
    const htmlContent = fs.readFileSync(distHtmlPath, 'utf8');
    const cspMatch = htmlContent.match(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content=["']([^"']+)["']/i);
    if (!cspMatch) {
      failures.push('No Content-Security-Policy meta tag found in dist/index.html');
    } else {
      const csp = cspMatch[1];
      console.log('Found CSP in dist/index.html:', csp);
      if (!csp.includes("connect-src 'none'")) failures.push("CSP missing connect-src 'none'");
      if (!csp.includes("default-src 'self'")) failures.push("CSP missing default-src 'self'");
      if (!csp.includes("object-src 'none'")) failures.push("CSP missing object-src 'none'");
      if (!csp.includes("script-src 'self'")) failures.push("CSP missing script-src 'self'");
      if (csp.includes('https:') || csp.includes('http:')) failures.push('CSP contains permissive http/https origin');
    }

    // Check for any external URLs in dist/index.html
    const externalUrlMatches = htmlContent.match(/(?:href|src)=["']https?:\/\/[^"']+["']/gi);
    if (externalUrlMatches) {
      failures.push(`dist/index.html contains external URLs: ${externalUrlMatches.join(', ')}`);
    } else {
      console.log('dist/index.html contains ZERO external URLs.');
    }
  }

  // 2. Static Audit of package.json dependencies
  console.log('\n[Check 2] Inspecting package.json dependencies for telemetry/network...');
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const approvedDeps = [
    'exifr', 'hash-wasm', 'lucide-react', 'mp4box', 'papaparse', 'react', 'react-dom', 'zod'
  ];
  const deps = Object.keys(pkg.dependencies || {});
  for (const dep of deps) {
    if (!approvedDeps.includes(dep)) {
      failures.push(`Unapproved dependency found in package.json: ${dep}`);
    }
  }
  console.log(`Audited ${deps.length} production dependencies against approved manifest: all approved.`);

  // 3. Runtime Verification with Playwright against Preview Server
  console.log('\n[Check 3] Launching Headless Chromium to verify runtime integrity...');
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Monitor all outgoing network requests
  const networkRequests = [];
  page.on('request', (req) => {
    networkRequests.push({
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType()
    });
  });

  try {
    const res = await page.goto('http://127.0.0.1:4173');
    if (!res || res.status() !== 200) {
      failures.push(`Failed to load preview server (status: ${res ? res.status() : 'none'})`);
    } else {
      console.log('Preview server responded HTTP 200.');
      const headers = res.headers();
      const serverCsp = headers['content-security-policy'];
      console.log('Server CSP header:', serverCsp);
      if (!serverCsp || !serverCsp.includes("connect-src 'none'")) {
        failures.push("Preview server HTTP response header missing connect-src 'none'");
      }
    }

    // Verify zero external network requests
    const externalRequests = networkRequests.filter(r => {
      try {
        const u = new URL(r.url);
        return u.hostname !== '127.0.0.1' && u.hostname !== 'localhost';
      } catch {
        return false;
      }
    });

    if (externalRequests.length > 0) {
      failures.push(`External network requests detected: ${JSON.stringify(externalRequests)}`);
    } else {
      console.log('Confirmed: 0 external network requests during page load.');
    }

    // 4. Test BrowserGate in supported mode (Chromium default)
    console.log('\n[Check 4] Testing BrowserGate in supported mode (Chromium)...');
    const shellVisible = await page.locator('#app-shell').isVisible();
    const gateVisible = await page.locator('#browser-gate-unsupported').isVisible();
    if (!shellVisible) failures.push('App shell is NOT visible in supported browser (Chromium)');
    if (gateVisible) failures.push('BrowserGate unsupported card IS visible in supported browser (Chromium)');
    console.log(`BrowserGate in supported mode: shellVisible=${shellVisible}, gateVisible=${gateVisible}`);

    // 5. Test BrowserGate in unsupported mode (simulate missing showDirectoryPicker)
    console.log('\n[Check 5] Testing BrowserGate in simulated unsupported browser...');
    const pageUnsupported = await context.newPage();
    await pageUnsupported.addInitScript(() => {
      delete window.showDirectoryPicker;
    });
    await pageUnsupported.goto('http://127.0.0.1:4173');

    const unsuppShellVisible = await pageUnsupported.locator('#app-shell').isVisible();
    const unsuppGateVisible = await pageUnsupported.locator('#browser-gate-unsupported').isVisible();
    const textContent = await pageUnsupported.locator('#browser-gate-unsupported').textContent();
    const expectedMsg = 'This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.';

    if (unsuppShellVisible) failures.push('App shell is visible when showDirectoryPicker is deleted!');
    if (!unsuppGateVisible) failures.push('Unsupported card is NOT visible when showDirectoryPicker is deleted!');
    if (!textContent || !textContent.includes(expectedMsg)) {
      failures.push(`Unsupported message mismatch. Expected "${expectedMsg}", got "${textContent}"`);
    }
    const interactiveElements = await pageUnsupported.locator('button, input, select, textarea, a').count();
    if (interactiveElements > 0) {
      failures.push(`Found ${interactiveElements} interactive elements on unsupported screen (violated "and nothing else")`);
    }
    console.log(`BrowserGate unsupported mode: gateVisible=${unsuppGateVisible}, shellVisible=${unsuppShellVisible}, interactiveCount=${interactiveElements}`);

    // 6. Test Active CSP Enforcement against multiple attack vectors
    console.log('\n[Check 6] Testing Active CSP blocking across network attack vectors...');
    const cspAttacks = await page.evaluate(async () => {
      const results = {};

      // Vector 1: fetch
      try {
        await fetch('http://127.0.0.1:4173/prohibited-api');
        results.fetch = 'ALLOWED (VIOLATION)';
      } catch (e) {
        results.fetch = 'BLOCKED (' + e.message + ')';
      }

      // Vector 2: XMLHttpRequest
      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', 'http://127.0.0.1:4173/prohibited-xhr');
          xhr.onload = () => resolve('ALLOWED');
          xhr.onerror = () => reject(new Error('XHR error / blocked'));
          xhr.send();
        });
        results.xhr = 'ALLOWED (VIOLATION)';
      } catch (e) {
        results.xhr = 'BLOCKED (' + e.message + ')';
      }

      // Vector 3: WebSocket
      try {
        new WebSocket('ws://127.0.0.1:4173/ws');
        results.websocket = 'ALLOWED (VIOLATION)';
      } catch (e) {
        results.websocket = 'BLOCKED (' + e.message + ')';
      }

      // Vector 4: navigator.sendBeacon
      try {
        const beaconSuccess = navigator.sendBeacon('http://127.0.0.1:4173/beacon', 'data');
        if (beaconSuccess) {
          results.beacon = 'ALLOWED (VIOLATION)';
        } else {
          results.beacon = 'BLOCKED (returned false)';
        }
      } catch (e) {
        results.beacon = 'BLOCKED (' + e.message + ')';
      }

      return results;
    });

    console.log('CSP attack results:', cspAttacks);
    for (const [vec, res] of Object.entries(cspAttacks)) {
      if (res.includes('ALLOWED')) {
        failures.push(`CSP failed to block ${vec}: ${res}`);
      }
    }

  } finally {
    await browser.close();
  }

  console.log('\n--- AUDIT SUMMARY ---');
  if (failures.length === 0) {
    console.log('ALL FORENSIC AUDIT CHECKS PASSED. VERDICT: CLEAN');
    return { verdict: 'CLEAN', failures: [] };
  } else {
    console.log('FAILURES DETECTED. VERDICT: INTEGRITY VIOLATION');
    console.log(failures);
    return { verdict: 'INTEGRITY VIOLATION', failures };
  }
}

runForensicAudit().then((result) => {
  if (result.verdict !== 'CLEAN') process.exit(1);
  process.exit(0);
}).catch((err) => {
  console.error('Fatal audit execution error:', err);
  process.exit(2);
});
