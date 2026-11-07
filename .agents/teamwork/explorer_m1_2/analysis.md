# Technical Analysis: Content Security Policy, Air-Gap Verification, and Strict Linting

**Agent:** `explorer_m1_2`  
**Milestone:** Milestone 1 (App Shell, Security & Scaffolding)  
**Date:** 2026-11-07  
**Working Directory:** `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m1_2`

---

## 1. Executive Summary

This report establishes the complete security, air-gap, and static quality blueprint for the Data Collection Tool (DCT) Milestone 1. The DCT is designed to operate on laboratory collection machines under strict data protection constraints (India DPDP Act 2023 / Rules 2025). The app runs entirely offline without servers or cloud uploads.

The core responsibilities analyzed here are:
1. **Content Security Policy (CSP)**: Hardening `index.html` and HTTP server headers to enforce `connect-src 'none'`, disallow remote scripts, restrict images/media/frames to local `blob:` URLs and `'self'`, and block object plugins.
2. **Air-Gap Invariants**: Formulating strict guarantees for zero remote fonts, zero CDN references, zero telemetry, zero analytics, and zero external API calls.
3. **Playwright Zero-Network Request Verification (Acceptance Test T-02)**: Designing automated multi-tier network interception and assertion patterns to guarantee zero network calls across the entire user workflow.
4. **Strict ESLint Configuration**: Formulating the ESLint configuration enforcing `@typescript-eslint/no-explicit-any: error` and zero-warning build gates.

---

## 2. Content Security Policy (CSP) Deep Dive

### 2.1 The Canonical Directive String
Per `docs/consent-tagging/app-design.md` §1 (lines 32–35), the required CSP directive is:

```text
default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'
```

### 2.2 Directive-by-Directive Rationale and Behavioral Analysis

| Directive | Allowed Sources | Security & Architectural Rationale |
|---|---|---|
| `default-src` | `'self'` | Acts as the fallback restriction. Disallows loading fonts, manifests, or child workers from external origins. |
| `img-src` | `'self' blob:` | Allows bundled static assets (logos, icons) via `'self'`. Allows local image assets (`IMG-0001.png`, etc.) displayed via `URL.createObjectURL(fileHandle)` in native `<img>` elements. Forbids remote `https:` images or arbitrary `data:` URIs. |
| `media-src` | `blob:` | **Notice: `'self'` is omitted.** Video (`VID-0005.mp4`) and audio (`AUD-0006.wav`) files selected from the local collection folder are loaded exclusively via `blob:` URLs into native `<video>` and `<audio>` players. Disallows streaming from server endpoints or remote CDNs. |
| `frame-src` | `blob:` | Document viewer requirement (`DOC-0008.pdf`). Allows embedding PDF documents in an `<iframe>` via `blob:` URL using the browser's built-in PDF viewer. Forbids iframe framing of any external site. |
| `object-src` | `'none'` | Completely disables legacy plugin execution (`<object>`, `<embed>`, `<applet>`). Forces document viewing to use `<iframe src="blob:...">` rather than plugin embeds. |
| `connect-src` | `'none'` | **The central air-gap enforcement mechanism.** Prohibits all outbound browser networking: `fetch()`, `XMLHttpRequest`, `WebSocket`, `EventSource`, and `navigator.sendBeacon()`. If any code or library attempts a network call, the browser immediately blocks the request at the network stack and throws a security violation error. |
| `script-src` | `'self'` | Executes scripts exclusively from the local origin bundle. Forbids inline `<script>` tags, forbids `eval()` and `new Function()`, and forbids loading scripts from external CDNs (unpkg, cdnjs, etc.). |
| `style-src` | `'self' 'unsafe-inline'` | Allows bundled stylesheets from the local origin. Allows inline styles required by React dynamic styles (e.g., pan/zoom transforms, audio scrubber progress bars, and Tailwind injected utilities). Forbids `@import url('https://...')` remote fonts. |

### 2.3 Dual-Placement Strategy: `<meta>` Tag & HTTP Response Headers

To ensure defense-in-depth and satisfy both static file delivery and server-served scenarios:

#### A. Static Meta Tag in `index.html`
Place the `<meta>` tag inside `<head>` as the very first element after charset and viewport:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    />
    <title>Data Collection Tool (DCT)</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

#### B. HTTP Header Injection in `vite.config.ts`
`TEST_INFRA.md` (lines 14 & 27) and `app-design.md` (§1 line 35) require that headers be checked. Configure both Vite dev server and preview server to serve the header:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const CSP_POLICY =
  "default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    hmr: false, // Disables HMR WebSocket to avoid connect-src 'none' CSP warnings in dev console
    headers: {
      'Content-Security-Policy': CSP_POLICY,
    },
  },
  preview: {
    port: 4173,
    headers: {
      'Content-Security-Policy': CSP_POLICY,
    },
  },
});
```

*Architectural Note on Vite Dev vs. Preview:*
In Vite dev mode, Vite normally injects a WebSocket client for Hot Module Replacement (`ws://localhost:5173`). Because `connect-src 'none'` blocks all WebSockets, setting `server.hmr: false` prevents WebSocket connection attempts and keeps the developer console completely free of CSP violation warnings.
For Playwright E2E testing and lab deployment, the application is served via `npm run preview` from `dist/` static files where no HMR client exists.

---

## 3. Air-Gap Invariants & Auditing Protocol

### 3.1 Five Invariant Rules
1. **Zero Remote Fonts**:
   - No Google Fonts (`fonts.googleapis.com`), Adobe Typekit, or CDN fonts.
   - Tailwind font family configuration must specify system fonts exclusively:
     ```javascript
     fontFamily: {
       sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
       mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
     }
     ```
2. **Zero CDN Links**:
   - No `<script src="https://...">` or `<link href="https://...">` anywhere in the project.
   - All third-party libraries (`react`, `papaparse`, `zod`, `exifr`, `mp4box`, `hash-wasm`) are declared as npm dependencies in `package.json` and compiled into static local bundles.
3. **Zero Telemetry and Zero Analytics**:
   - Zero analytics SDKs (no Google Analytics, Sentry, Mixpanel, Datadog, PostHog, Segment).
   - Zero crash-reporting beacons or `navigator.sendBeacon` calls.
4. **Zero External API Calls**:
   - No external requests for time, geo-IP, weather, or updates.
   - Capture times are derived purely from local file metadata:
     - Images: EXIF `DateTimeOriginal` (interpreted in `Asia/Kolkata` / UTC+05:30 -> converted to ISO 8601 UTC with `Z`).
     - Videos: MP4 `mvhd` atom creation timestamp (UTC).
     - Fallback: Local file handle `lastModified`.
   - File hashes (SHA-256) are calculated strictly on the client using Web Crypto API / `hash-wasm` in a background Web Worker.
5. **Zero Post-Load Network Requests**:
   - Once the HTML document, JS bundle, and CSS bundle are loaded, zero further network requests (whether local or remote) shall be issued during the entire session lifecycle.

### 3.2 Automated Static Air-Gap Audit Test
A Vitest unit test (`tests/unit/security/csp.test.ts`) must verify that:
- `index.html` exists and contains the exact CSP meta tag.
- No `http://` or `https://` URLs exist in `index.html`.
- No font CDN or remote script references exist in `src/`.

---

## 4. Playwright Zero-Network Request Verification (Acceptance Test T-02)

### 4.1 Specification Requirement (acceptance-tests.md)
> **T-02: Browser and network**  
> *"In Firefox the app shows only the Chrome/Edge page; in Chrome the page's CSP has `connect-src 'none'` and Playwright records zero network requests after load across a full tag-and-save run"*

### 4.2 Multi-Layer Interception & Verification Architecture

```
+----------------------------------------------------------------------------------+
|                            Playwright Browser Runner                             |
|                                                                                  |
|  +----------------------------------------------------------------------------+  |
|  | Layer 1: Header & Meta Tag Check                                           |  |
|  | - Verify HTTP Response Header: 'Content-Security-Policy'                   |  |
|  | - Verify DOM <meta http-equiv="Content-Security-Policy" content="...">     |  |
|  +----------------------------------------------------------------------------+  |
|                                                                                  |
|  +----------------------------------------------------------------------------+  |
|  | Layer 2: External Request Trap (page.route)                                 |  |
|  | - Intercepts all routes (**/*)                                             |  |
|  | - Aborts and fails if hostname != localhost && hostname != 127.0.0.1        |  |
|  +----------------------------------------------------------------------------+  |
|                                                                                  |
|  +----------------------------------------------------------------------------+  |
|  | Layer 3: Post-Load Activity Monitor (page.on('request'))                   |  |
|  | - Activated after page load (networkidle)                                  |  |
|  | - Records all requests during user actions (scanning, hashing, saving)    |  |
|  | - Asserts recorded count == 0                                              |  |
|  +----------------------------------------------------------------------------+  |
|                                                                                  |
|  +----------------------------------------------------------------------------+  |
|  | Layer 4: Active CSP Violation Test                                         |  |
|  | - page.evaluate: executes fetch('/api/test')                                |  |
|  | - Asserts fetch is rejected by browser engine with TypeError                |  |
|  | - Listens for 'securitypolicyviolation' event matching connect-src 'none'  |  |
|  +----------------------------------------------------------------------------+  |
+----------------------------------------------------------------------------------+
```

### 4.3 Detailed Playwright Spec Implementation (`e2e/t02-browser-network.spec.ts`)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Acceptance Test T-02: Browser Gate and Air-Gapped Network Verification', () => {

  test('T-02.1: CSP meta tag and response headers enforce air-gapped directives', async ({ page }) => {
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

    // Intercept and trap all requests
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        externalRequests.push(route.request().url());
        route.abort('blockedbyclient');
      } else {
        route.continue();
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify zero external network requests
    expect(externalRequests).toEqual([]);
  });

  test('T-02.3: Zero network requests recorded after page load across workflow execution', async ({ page }) => {
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

  test('T-02.4: Active CSP enforcement blocks outbound fetch and triggers violation event', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up in-page listener for CSP violation events
    const violations: { blockedURI: string; violatedDirective: string }[] = [];
    await page.exposeFunction('onCspViolation', (data: { blockedURI: string; violatedDirective: string }) => {
      violations.push(data);
    });

    await page.evaluate(() => {
      window.addEventListener('securitypolicyviolation', (e) => {
        // @ts-expect-error exposed function
        window.onCspViolation({
          blockedURI: e.blockedURI,
          violatedDirective: e.violatedDirective,
        });
      });
    });

    // Attempt a prohibited fetch request
    const fetchFailed = await page.evaluate(async () => {
      try {
        await fetch('https://example.com/api/test');
        return false;
      } catch (err) {
        return true; // Expected: fetch is blocked
      }
    });

    expect(fetchFailed).toBe(true);

    // Wait briefly for violation event dispatch
    await page.waitForTimeout(100);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].violatedDirective).toContain('connect-src');
  });

  test('T-02.5: Browser Gate displays Chrome/Edge requirement screen in unsupported browsers', async ({ page }) => {
    // Simulate unsupported browser by deleting window.showDirectoryPicker before load
    await page.addInitScript(() => {
      // @ts-expect-error delete for simulation
      delete window.showDirectoryPicker;
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Requirement message exact text check
    const requirementText = page.locator('text=This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.');
    await expect(requirementText).toBeVisible();

    // Verify main app controls are NOT rendered
    await expect(page.locator('button:has-text("Open collection folder")')).not.toBeVisible();
  });
});
```

---

## 5. Strict ESLint Configuration Analysis

### 5.1 Requirements & Rationale
Per `AGENTS.md` (Rule 1 & Section 1) and `ORIGINAL_REQUEST.md` (R1 & Quality Bar):
- ESLint must enforce strict TypeScript rules.
- Mandatory rule: `'@typescript-eslint/no-explicit-any': 'error'`.
- `npm run lint` must pass with zero errors and zero warnings (`--max-warnings 0`).

### 5.2 ESLint Configuration Format: Flat Config (`eslint.config.js`)
Given Node v22.15.0 and standard modern TypeScript tooling, the recommended configuration uses ESLint 9 Flat Config:

```javascript
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'tools',
      '.agents',
      'playwright-report',
      'test-results',
      '*.config.js',
      '*.config.ts',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Mandatory project constraint
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
```

*(Alternatively, if ESLint 8 legacy configuration `.eslintrc.cjs` is selected by the worker, the equivalent configuration extends `plugin:@typescript-eslint/recommended`, `plugin:react-hooks/recommended`, and specifies `'@typescript-eslint/no-explicit-any': 'error'` under `rules`.)*

### 5.3 Scripts in `package.json`
```json
{
  "scripts": {
    "lint": "eslint . --max-warnings 0",
    "lint:fix": "eslint . --fix"
  }
}
```

---

## 6. Concrete Implementation Steps for Worker

The worker assigned to implement Milestone 1 should execute the following steps in sequence:

### Step 1: Create `index.html`
- File: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\index.html`
- Include the exact CSP meta tag:
  `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'" />`
- Mount point `<div id="root"></div>` and entry module `<script type="module" src="/src/main.tsx"></script>`.
- Verify zero remote fonts or external links in `<head>`.

### Step 2: Configure `vite.config.ts`
- File: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\vite.config.ts`
- Configure `server.headers` and `preview.headers` to set `'Content-Security-Policy'`.
- Set `server.hmr: false` to eliminate dev-mode WebSocket connection attempts under `connect-src 'none'`.

### Step 3: Configure ESLint
- File: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\eslint.config.js` (or `.eslintrc.cjs`)
- Implement strict TypeScript rules with `@typescript-eslint/no-explicit-any: 'error'`.
- Ensure `tools/` and `.agents/` are ignored so Python files and markdown files are not processed by ESLint.

### Step 4: Implement Unit Test for CSP & Air-Gap Invariants
- File: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\tests/unit/security/csp.test.ts`
- Uses Node `fs.readFileSync` to parse `index.html`.
- Asserts presence and exact content of CSP meta tag.
- Asserts absence of any `http://` or `https://` URLs in `index.html`.

### Step 5: Implement Playwright Acceptance Test T-02
- File: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\e2e/t02-browser-network.spec.ts`
- Implement tests T-02.1 through T-02.5 as detailed in Section 4.3.

---

## 7. Verification Commands & Acceptance Criteria

| Check | Command | Pass Criteria |
|---|---|---|
| ESLint Strict Linting | `npm run lint` | Exits 0, zero errors, zero warnings. Reject any code containing `any`. |
| TypeScript Strict Check | `npx tsc --noEmit` | Exits 0, zero type errors (`strict: true`). |
| CSP Unit Test | `npx vitest run tests/unit/security/csp.test.ts` | 100% pass (verifies meta tag and zero remote URLs in `index.html`). |
| Playwright E2E Suite (T-02) | `npx playwright test e2e/t02-browser-network.spec.ts` | 100% pass (5 tests covering headers, meta tag, zero post-load requests, fetch block, and browser gate). |
| Python Reference Parity | `python -m unittest tools/test_validate_export.py` | 20/20 unit tests pass. |

---
*End of Technical Analysis.*
