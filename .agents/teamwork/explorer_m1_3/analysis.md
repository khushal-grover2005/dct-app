# Technical Analysis: Browser Capability Gating, Unsupported UI, and Smoke Test Harness (Milestone 1)

**Working Directory**: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m1_3`  
**Subagent**: `explorer_m1_3`  
**Date**: 2026-11-07  
**Scope**: Browser Capability Gating (`window.showDirectoryPicker`), Unsupported Browser UI Design, Entry Point (`src/main.tsx`), Tailwind Tokens, and Vitest/Playwright Verification Harness.

---

## 1. Executive Summary & Specification Traceability

The Data Collection Tool (DCT) is an air-gapped, client-side web application designed to run locally on lab collection workstations. Because the tool must read entire directories of raw assets and write metadata sheets and progress files directly into local directories without server intermediation, it strictly depends on the **File System Access API** (`window.showDirectoryPicker`).

### Requirement Traceability Matrix
| Requirement / Spec ID | Source Document | Mandate | Implementation Strategy |
|---|---|---|---|
| **R-05** | `docs/consent-tagging/use-cases.md` §UC-01 | In a browser without the File System Access API, the app shows one page explaining that Chrome or Edge is required, and nothing else. | Render dedicated `BrowserGate` fallback containing only the specified requirement copy. |
| **T-02** | `docs/consent-tagging/acceptance-tests.md` | In Firefox the app shows only the Chrome/Edge page; in Chrome the page's CSP has `connect-src 'none'` and Playwright records zero network requests after load. | Multi-browser test suite: Playwright Firefox verifies gate page; Playwright Chromium verifies app shell mount; network request interceptor verifies zero network calls. |
| **Feature 3** | `PROJECT.md` Feature Inventory | Browser Gate Screen: Detects `window.showDirectoryPicker`; renders Chrome/Edge requirement screen in unsupported browsers. | `src/app/BrowserGate.tsx` and `src/app/capabilities.ts`. |
| **Rule 1** | `AGENTS.md` Fixed Stack | React 18 + TypeScript strict + Vite static build, Chrome/Edge, File System Access API, Tailwind CSS, Vitest, Playwright. | Type-safe React components with strict TypeScript types, Tailwind utility tokens, and zero runtime dependencies. |

---

## 2. Browser Capability Detection Architecture

### 2.1 The Capability Test
The File System Access API specification defines `window.showDirectoryPicker` as an asynchronous method on the `Window` interface.
In browsers:
- **Desktop Chromium (Chrome ≥ 86, Edge ≥ 86, Opera ≥ 72)**: `window.showDirectoryPicker` is defined as a `function` (in secure contexts: `https://` or `http://localhost`).
- **Mozilla Firefox (all versions)**: `window.showDirectoryPicker` is `undefined`.
- **Apple Safari / WebKit (all versions)**: `window.showDirectoryPicker` is `undefined`.
- **Mobile Browsers (Android / iOS)**: Either undefined or throws unsupported capability.

### 2.2 Defensive Detection Logic
To prevent runtime crashes during server-side tooling, unit tests (e.g. jsdom), or unusual environments, the detection logic must verify:
1. `typeof window !== 'undefined'` (ensures DOM global context exists).
2. `'showDirectoryPicker' in window` (avoids property access errors).
3. `typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'` (validates callable function).

```typescript
// src/app/capabilities.ts
export function isFileSystemAccessSupported(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return (
    'showDirectoryPicker' in window &&
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  );
}
```

### 2.3 TypeScript Type Augmentation
Under `tsconfig.json` with `"strict": true` and `"noImplicitAny": true`, accessing `window.showDirectoryPicker` directly without typing triggers:
`TS2339: Property 'showDirectoryPicker' does not exist on type 'Window & typeof globalThis'.`

To guarantee compile-time safety and zero `tsc --noEmit` errors before or after `@types/wicg-file-system-access` is installed, declare the interface augmentation in `src/types/file-system-access.d.ts`:

```typescript
// src/types/file-system-access.d.ts
export {};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: 'read' | 'readwrite';
      id?: string;
      startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
    }) => Promise<FileSystemDirectoryHandle>;
  }
}
```

---

## 3. UI Component Architecture & Strict Layout Rules

### 3.1 Unsupported Screen: The "Nothing Else" Rule
Per **R-05**, **T-02**, and the dispatch specification:
- In unsupported browsers, render:  
  `"This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly."`
- **Strict Invariant**: Render **nothing else**.
  - No application header or navigation bar.
  - No sidebar, menus, buttons, search bars, or input fields.
  - No footer, version stamps, or external links.
  - No secondary explanatory paragraphs or help accordions.

#### DOM Structure for Unsupported Screen
```tsx
<div
  id="browser-gate-unsupported"
  role="alert"
  aria-live="polite"
  className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-6"
>
  <div className="max-w-md w-full bg-white rounded-lg border border-slate-200 p-8 shadow-sm text-center">
    <p className="text-base font-medium text-slate-800 leading-relaxed">
      This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.
    </p>
  </div>
</div>
```
*Why this structure is optimal:*
1. The visible text content of the entire page body is exactly and only the required sentence.
2. Centered card design adheres to professional lab tool ergonomics.
3. Clean semantic markup (`role="alert"`, `aria-live="polite"`) ensures full screen-reader accessibility without adding unwanted DOM text.

### 3.2 Supported Application Shell Mount (`src/app/App.tsx`)
In supported browsers (Chrome / Edge), `BrowserGate` renders its `children` (`<App />`). In Milestone 1, `App.tsx` establishes the root container shell:
- Header with tool identity (`Data Collection Tool`).
- Main content container with clear layout bounds.
- Minimum viewport enforcement: `min-w-[1280px]` container per `app-design.md §2.5` ("minimum supported window 1280 × 720").

```tsx
// src/app/App.tsx
import React from 'react';

export function App(): JSX.Element {
  return (
    <div id="app-shell" className="min-h-screen bg-slate-50 text-slate-900 flex flex-col min-w-[1280px]">
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          Data Collection Tool
        </h1>
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          Increment 1 · Offline Shell
        </span>
      </header>
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        <div id="app-content" className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800 mb-2">Workspace Ready</h2>
          <p className="text-sm text-slate-600">
            Supported browser detected with File System Access API capabilities.
          </p>
        </div>
      </main>
    </div>
  );
}
```

### 3.3 Gate Component (`src/app/BrowserGate.tsx`)
`BrowserGate` acts as the conditional root router:
- Accepts `children: React.ReactNode`.
- Accepts optional `supportedOverride?: boolean` prop for explicit unit test override without mutating globals.
- Defaults to `isFileSystemAccessSupported()`.
- If unsupported, renders the isolated unsupported screen.
- If supported, renders `{children}`.

```tsx
// src/app/BrowserGate.tsx
import React from 'react';
import { isFileSystemAccessSupported } from './capabilities';

export interface BrowserGateProps {
  children: React.ReactNode;
  supportedOverride?: boolean;
}

export function BrowserGate({ children, supportedOverride }: BrowserGateProps): JSX.Element {
  const isSupported = supportedOverride !== undefined ? supportedOverride : isFileSystemAccessSupported();

  if (!isSupported) {
    return (
      <div
        id="browser-gate-unsupported"
        role="alert"
        aria-live="polite"
        className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-6"
      >
        <div className="max-w-md w-full bg-white rounded-lg border border-slate-200 p-8 shadow-sm text-center">
          <p className="text-base font-medium text-slate-800 leading-relaxed">
            This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
```

### 3.4 Entry Point (`src/main.tsx`)
Mounts the React root cleanly:
```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserGate } from './app/BrowserGate';
import { App } from './app/App';
import './styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Fatal: #root element not found in DOM.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserGate>
      <App />
    </BrowserGate>
  </React.StrictMode>
);
```

---

## 4. Styling Tokens and Tailwind Integration

### 4.1 CSS Tokens (`src/styles/index.css`)
In alignment with `PROJECT.md` §Code Layout and `app-design.md` §1 & §7:
1. Load Tailwind core layers: `@tailwind base; @tailwind components; @tailwind utilities;`.
2. Define CSS custom properties for neutral lab interface tokens:
   - Font stack: Native system fonts (zero external font downloads, complying with air-gap CSP).
   - Neutral backgrounds (`slate-50` / `#f8fafc`).
   - Clean slate text colors (`slate-900` headings, `slate-600` secondary).
   - Border radius and subtle shadows for lab readability.

```css
/* src/styles/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --font-system: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
  --bg-app: #f8fafc;
  --text-main: #0f172a;
}

html, body {
  margin: 0;
  padding: 0;
  background-color: var(--bg-app);
  color: var(--text-main);
  font-family: var(--font-system);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
```

---

## 5. Concrete Worker Implementation Guide

The Worker agent should execute the following implementation steps in order:

### Step 1: Type Definitions (`src/types/file-system-access.d.ts`)
Create `src/types/file-system-access.d.ts` with the global `Window` interface augmentation so TypeScript compiler knows about `window.showDirectoryPicker`.

### Step 2: Capability Utility (`src/app/capabilities.ts`)
Create `src/app/capabilities.ts` exporting `isFileSystemAccessSupported(): boolean`.

### Step 3: Browser Gate Component (`src/app/BrowserGate.tsx`)
Create `src/app/BrowserGate.tsx` rendering the unsupported card if unsupported, or children if supported.

### Step 4: Shell Container (`src/app/App.tsx`)
Create `src/app/App.tsx` providing `#app-shell` and `#app-content`.

### Step 5: Global CSS Tokens (`src/styles/index.css`)
Create `src/styles/index.css` importing Tailwind directives and declaring system font defaults.

### Step 6: Application Entry Point (`src/main.tsx`)
Create `src/main.tsx` mounting `<BrowserGate><App /></BrowserGate>` onto `#root`.

### Step 7: Unit Test Suite (`tests/unit/browserGate.test.tsx`)
Create Vitest unit tests verifying:
- Renders unsupported message when `window.showDirectoryPicker` is absent.
- Renders unsupported message when `window.showDirectoryPicker` is not a function.
- Renders app shell when `window.showDirectoryPicker` is present.
- Supports `supportedOverride` prop.
- Verifies that no other text or buttons exist in unsupported state.

### Step 8: E2E Smoke Test Suite (`e2e/t02-browser-network.spec.ts`)
Create Playwright tests verifying:
- In Firefox: Unsupported card is displayed, exact text matches, `#app-shell` is absent.
- In Chromium: `#app-shell` is displayed, unsupported card is absent.
- Across both: Zero network requests are made after page load.

---

## 6. Recommended Verification Commands & Test Harness

### 6.1 Unit Test Specification (`tests/unit/browserGate.test.tsx`)
```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { BrowserGate } from '../../src/app/BrowserGate';
import { isFileSystemAccessSupported } from '../../src/app/capabilities';

describe('BrowserGate Capability & UI Gating', () => {
  const originalShowDirectoryPicker = window.showDirectoryPicker;

  afterEach(() => {
    if (originalShowDirectoryPicker !== undefined) {
      window.showDirectoryPicker = originalShowDirectoryPicker;
    } else {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    }
  });

  it('detects capability accurately in capability helper', () => {
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    expect(isFileSystemAccessSupported()).toBe(false);

    window.showDirectoryPicker = vi.fn();
    expect(isFileSystemAccessSupported()).toBe(true);
  });

  it('renders ONLY the required unsupported message when showDirectoryPicker is missing', () => {
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;

    const { container } = render(
      <BrowserGate>
        <div data-testid="app-shell">App Shell Content</div>
      </BrowserGate>
    );

    const expectedText = 'This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.';
    expect(screen.getByText(expectedText)).toBeInTheDocument();
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();

    // Verify "and nothing else" constraint: only the message paragraph is rendered inside the alert container
    const alertBox = container.querySelector('#browser-gate-unsupported');
    expect(alertBox).toBeInTheDocument();
    expect(alertBox?.textContent?.trim()).toBe(expectedText);
    expect(container.querySelectorAll('button, input, select, textarea, a')).toHaveLength(0);
  });

  it('renders application children when showDirectoryPicker is supported', () => {
    window.showDirectoryPicker = vi.fn();

    render(
      <BrowserGate>
        <div data-testid="app-shell">App Shell Content</div>
      </BrowserGate>
    );

    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.queryByText(/requires desktop Google Chrome or Microsoft Edge/i)).not.toBeInTheDocument();
  });

  it('honors supportedOverride prop for isolated testing', () => {
    window.showDirectoryPicker = vi.fn(); // window is supported

    // Force override to false
    render(
      <BrowserGate supportedOverride={false}>
        <div data-testid="app-shell">App Shell Content</div>
      </BrowserGate>
    );

    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
    expect(screen.getByText(/requires desktop Google Chrome or Microsoft Edge/i)).toBeInTheDocument();
  });
});
```

### 6.2 Playwright E2E Smoke Test Specification (`e2e/t02-browser-network.spec.ts`)
```typescript
import { test, expect } from '@playwright/test';

test.describe('Acceptance Test T-02: Browser Gate & Zero Network Calls', () => {
  test('In Firefox, shows only the Chrome/Edge requirement screen (R-05)', async ({ page, browserName }) => {
    test.skip(browserName !== 'firefox', 'This test specifically validates unsupported browser behavior in Firefox');

    // Intercept all network traffic to confirm 0 remote calls
    const externalRequests: string[] = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        externalRequests.push(request.url());
      }
    });

    await page.goto('/');

    // 1. Assert unsupported container is visible
    const gateCard = page.locator('#browser-gate-unsupported');
    await expect(gateCard).toBeVisible();

    // 2. Assert exact required text
    const expectedText = 'This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.';
    await expect(gateCard).toHaveText(expectedText);

    // 3. Assert "and nothing else": no shell, no buttons, no inputs
    await expect(page.locator('#app-shell')).toHaveCount(0);
    await expect(page.locator('button, input, select, textarea, a')).toHaveCount(0);

    // 4. Assert zero external network requests
    expect(externalRequests).toEqual([]);
  });

  test('In Chromium, renders the app shell and zero external network calls (R-06)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'This test specifically validates supported browser behavior in Chromium');

    const externalRequests: string[] = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        externalRequests.push(request.url());
      }
    });

    await page.goto('/');

    // 1. Assert unsupported screen is NOT present
    await expect(page.locator('#browser-gate-unsupported')).toHaveCount(0);

    // 2. Assert App shell is rendered
    await expect(page.locator('#app-shell')).toBeVisible();
    await expect(page.getByText('Data Collection Tool')).toBeVisible();

    // 3. Assert zero external network requests
    expect(externalRequests).toEqual([]);
  });
});
```

### 6.3 Command Checklist for Worker Verification
1. **Typecheck**:
   ```powershell
   npx tsc --noEmit
   ```
   *Expected*: Exits with code 0, 0 errors.
2. **ESLint**:
   ```powershell
   npm run lint
   ```
   *Expected*: Exits with code 0, 0 warnings or errors (`no-explicit-any: error` enforced).
3. **Unit Tests (Vitest)**:
   ```powershell
   npm test tests/unit/browserGate.test.tsx
   ```
   *Expected*: All unit test cases pass.
4. **Playwright E2E**:
   ```powershell
   npx playwright test e2e/t02-browser-network.spec.ts --project=firefox
   npx playwright test e2e/t02-browser-network.spec.ts --project=chromium
   ```
   *Expected*: Both projects pass. Firefox renders unsupported screen; Chromium renders app shell.
5. **Python Reference Validator**:
   ```powershell
   python -m unittest tools/test_validate_export.py
   ```
   *Expected*: All 20 tests pass.

---

## 7. Caveats & Invalidation Conditions

1. **Firefox in Playwright**:
   The Playwright Firefox browser binary must be installed via `npx playwright install firefox` if not already present on the collection workstation. If the binary is missing, `npx playwright test --project=firefox` will report a missing browser error. The Worker should run `npx playwright install firefox` during environment preparation if needed.
2. **Secure Context Requirement**:
   In Chromium, `window.showDirectoryPicker` is only exposed in secure contexts (`isSecureContext === true`). When running in development via Vite, Vite serves on `http://localhost:5173`, which the W3C specification classifies as a secure context. Serving via an arbitrary unencrypted IP address (e.g. `http://192.168.1.100:5173`) would hide `window.showDirectoryPicker` even in Chrome. The user and lab documentation must mandate `localhost` or HTTPS.
3. **Strict Text Match Invalidation**:
   If any extraneous text (e.g. "Error 403", "Please update your browser", or navigation buttons) is injected into the unsupported screen, acceptance test T-02 and requirement R-05 will fail. The Worker must strictly keep only the single exact sentence.
