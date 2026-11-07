# Milestone 1 Scaffolding & Tooling Analysis

**Target Milestone**: M1 (Scaffold, Shell, CSP & Browser Gate)  
**Author**: `explorer_m1_1`  
**Date**: 2026-11-07  
**Status**: Ready for Worker Execution  

---

## 1. Executive Summary

Milestone 1 establishes the production-grade, air-gapped web application shell for the Data Collection Tool (DCT). The existing repository contains the project documentation, data contracts, synthetic test data, and Python validation tools, but has no initial frontend package manifest or source files.

This analysis provides the exact package versions, configurations, and concrete implementation blueprints required to initialize the project strictly adhering to `AGENTS.md`, `PROJECT.md`, `ORIGINAL_REQUEST.md`, and `docs/consent-tagging/app-design.md`.

---

## 2. Environment & Compatibility Matrix

### 2.1 System Environment (Verified)
- **Node.js**: `v22.15.0`
- **npm**: `11.3.0`
- **Python**: 3.x (with `tools/test_validate_export.py` passing 20/20 tests)
- **OS**: Windows

### 2.2 Dependency Compatibility & Resolutions
All package versions have been selected to satisfy the strict constraints without dependency conflicts:

| Package | Version | Justification & Compatibility Notes |
|---|---|---|
| `react` | `^18.3.1` | Fixed constraint: React 18. Cannot use React 19. |
| `react-dom` | `^18.3.1` | Must match React 18.3.1. |
| `papaparse` | `^5.4.1` | Fixed constraint: Robust bidirectional CSV parsing. |
| `zod` | `^3.23.8` | Fixed constraint: Strict schema validation for lists and contracts. |
| `exifr` | `^7.1.3` | Fixed constraint: EXIF metadata extraction (`DateTimeOriginal`). |
| `mp4box` | `^2.5.0` | Fixed constraint: MP4/MOV header metadata (`mvhd`). Note npm package name is `mp4box` (not `mp4box.js`). Ambient types required. |
| `hash-wasm` | `^4.11.0` | Fixed constraint: Streaming SHA-256 for large assets without memory blow-up. |
| `lucide-react` | `^0.460.0` | Clean SVG icons with zero remote assets or fonts. |
| `vite` | `^5.4.11` | Fixed constraint: Vite static build into `dist/`. Vite 5 has seamless React 18 and Vitest 2 support. |
| `@vitejs/plugin-react`| `^4.3.4` | Standard Vite React plugin. |
| `typescript` | `^5.6.3` | TypeScript compiler supporting strict mode and latest modern bundler resolution. |
| `tailwindcss` | `^3.4.15` | Stable, self-contained CSS utility framework without remote font fetching. |
| `postcss` | `^8.4.49` | Required by Tailwind CSS. |
| `autoprefixer` | `^10.4.20` | CSS vendor prefixing. |
| `eslint` | `^9.15.0` | Required linting engine using modern Flat Config (`eslint.config.js`). |
| `@eslint/js` | `^9.15.0` | ESLint JS configurations. |
| `typescript-eslint` | `^8.15.0` | ESLint flat config toolkit for TypeScript strict checking. |
| `eslint-plugin-react-hooks` | `^5.0.0` | Official React hook rules. |
| `eslint-plugin-react-refresh`| `^0.4.14` | Vite React fast refresh linting. |
| `vitest` | `^2.1.5` | Fixed constraint: Unit test runner paired with Vite. |
| `@testing-library/react` | `^14.3.1` | **CRITICAL**: Version 14/15 supports React 18. Version 16 requires React 19 and would cause peer-dependency failure. |
| `@testing-library/jest-dom` | `^6.6.3` | Custom DOM matchers for Vitest assertions. |
| `@testing-library/user-event`| `^14.5.2` | High-fidelity DOM event simulation. |
| `jsdom` | `^25.0.1` | Standard DOM environment for Vitest. |
| `@playwright/test` | `^1.49.0` | Fixed constraint: E2E runner for Chromium & Firefox. |
| `@types/wicg-file-system-access` | `^2023.10.5` | Official TypeScript definitions for `window.showDirectoryPicker`. |
| `@types/papaparse` | `^5.3.15` | TypeScript types for PapaParse. |
| `@types/react` | `^18.3.18` | TypeScript types for React 18. |
| `@types/react-dom` | `^18.3.5` | TypeScript types for React DOM 18. |

---

## 3. Configuration Specifications

### 3.1 `package.json`
```json
{
  "name": "dct-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "e2e": "playwright test"
  },
  "dependencies": {
    "exifr": "^7.1.3",
    "hash-wasm": "^4.11.0",
    "lucide-react": "^0.460.0",
    "mp4box": "^2.5.0",
    "papaparse": "^5.4.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@eslint/js": "^9.15.0",
    "@playwright/test": "^1.49.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^14.3.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/papaparse": "^5.3.15",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@types/wicg-file-system-access": "^2023.10.5",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.15.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.14",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.15",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.15.0",
    "vite": "^5.4.11",
    "vitest": "^2.1.5"
  }
}
```

### 3.2 `tsconfig.json`
Enforces strict typing (`strict: true`, `noImplicitAny: true`, `noUncheckedIndexedAccess: true`):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": [
    "src",
    "tests",
    "e2e",
    "vite.config.ts",
    "vitest.config.ts",
    "playwright.config.ts"
  ]
}
```

### 3.3 `vite.config.ts`
Configures React plugin, `@` path resolution alias, and Web Worker module bundling:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
```

### 3.4 `vitest.config.ts`
Configures unit testing in JSDOM, setup file, and strictly excludes E2E tests:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### 3.5 `playwright.config.ts`
Configures Chromium and Firefox projects. Firefox naturally tests the unsupported browser gate because Firefox intentionally lacks `window.showDirectoryPicker`.
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

### 3.6 `eslint.config.js`
Enforces `@typescript-eslint/no-explicit-any: error` and React Hooks rules via ESLint Flat Config:
```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'coverage', '.agents', 'tools'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  }
);
```

### 3.7 `tailwind.config.js` & `postcss.config.js`
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

---

## 4. Air-Gapped Security & Browser Gate

### 4.1 `index.html`
Implements the exact CSP mandated in `app-design.md` §1:
- `connect-src 'none'` guarantees zero network calls.
- Self-contained scripts, styles, and blob URLs for media/PDF rendering.
- No remote fonts or external CDN resources.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';"
    />
    <title>Data Collection Tool (DCT)</title>
  </head>
  <body class="bg-gray-50 text-gray-900 antialiased min-h-screen">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 4.2 Ambient Type Definitions
#### `src/types/mp4box.d.ts`
Prevents `Could not find a declaration file for module 'mp4box'` without using `any`:
```typescript
declare module 'mp4box' {
  export interface MP4MediaInfo {
    hasMoov: boolean;
    duration: number;
    timescale: number;
    isFragmented: boolean;
    isProgressive: boolean;
    hasIOD: boolean;
    created: Date;
    modified: Date;
    tracks: unknown[];
  }

  export interface MP4File {
    onReady?: (info: MP4MediaInfo) => void;
    onError?: (e: string) => void;
    appendBuffer(data: ArrayBuffer): number;
    flush(): void;
    start(): void;
    stop(): void;
  }

  export function createFile(): MP4File;

  const MP4Box: {
    createFile: () => MP4File;
  };

  export default MP4Box;
}
```

### 4.3 Browser Gate & Main Application Shell
#### `src/app/BrowserGate.tsx`
Checks capability `window.showDirectoryPicker` and displays clear instructions when accessed in unsupported browsers (e.g. Firefox, Safari):
```typescript
import React from 'react';

export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    typeof window.showDirectoryPicker === 'function'
  );
}

export const BrowserGate: React.FC = () => {
  return (
    <div
      role="alert"
      className="min-h-screen flex items-center justify-center bg-gray-50 p-6"
    >
      <div className="max-w-lg w-full bg-white rounded-lg shadow-md border border-gray-200 p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
          <svg
            className="w-8 h-8 text-amber-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Desktop Chrome or Edge Required
        </h1>
        <p className="text-gray-600 mb-6 leading-relaxed">
          The Data Collection Tool (DCT) is an air-gapped application that operates
          directly on your local files using the File System Access API. This capability
          is only available in desktop versions of <strong>Google Chrome</strong> or{' '}
          <strong>Microsoft Edge</strong>.
        </p>
        <div className="bg-gray-100 rounded p-4 text-sm text-gray-700">
          Please open this application in desktop Chrome or Edge to access collection folders.
        </div>
      </div>
    </div>
  );
};
```

#### `src/app/App.tsx`
Base application shell:
```typescript
import React from 'react';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <h1 className="text-xl font-semibold text-gray-900">
            Data Collection Tool
          </h1>
          <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 rounded">
            Air-Gapped
          </span>
        </div>
        <div className="text-sm text-gray-500">Increment 1 Shell</div>
      </header>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-lg border border-gray-200 p-8 shadow-sm">
          <h2 className="text-lg font-medium text-gray-900 mb-2">
            Collection Ingestion & Tagging
          </h2>
          <p className="text-gray-600 mb-6">
            Ready to ingest collection folder and consented participant list.
          </p>
          <div className="p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
            Browser capability verified: File System Access API is active.
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
```

#### `src/main.tsx`
Evaluates browser capability before rendering:
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import { BrowserGate, isFileSystemAccessSupported } from './app/BrowserGate';
import './styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find the root element');
}

const isSupported = isFileSystemAccessSupported();

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {isSupported ? <App /> : <BrowserGate />}
  </React.StrictMode>
);
```

#### `src/styles/index.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}
```

---

## 5. Testing & Verification Suite

### 5.1 Unit Test (`tests/unit/browserGate.test.tsx`)
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { BrowserGate, isFileSystemAccessSupported } from '@/app/BrowserGate';
import App from '@/app/App';

describe('Browser Capability Gate', () => {
  const originalPicker = window.showDirectoryPicker;

  afterEach(() => {
    window.showDirectoryPicker = originalPicker;
  });

  it('detects when File System Access API is available', () => {
    window.showDirectoryPicker = (() => Promise.resolve({})) as unknown as typeof window.showDirectoryPicker;
    expect(isFileSystemAccessSupported()).toBe(true);
  });

  it('detects when File System Access API is missing', () => {
    // @ts-expect-error test unsupported browser
    delete window.showDirectoryPicker;
    expect(isFileSystemAccessSupported()).toBe(false);
  });

  it('renders unsupported browser screen with Chrome/Edge requirement message', () => {
    render(<BrowserGate />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /desktop chrome or edge required/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/File System Access API/i)).toBeInTheDocument();
  });

  it('renders application shell in supported environments', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /data collection tool/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/air-gapped/i)).toBeInTheDocument();
  });
});
```

### 5.2 Vitest Setup (`tests/setup.ts`)
```typescript
import '@testing-library/jest-dom';
```

### 5.3 Playwright E2E Test (`e2e/browser-gate.spec.ts`)
Verifies acceptance test T-02:
1. In Firefox, only the Chrome/Edge requirement screen is shown.
2. In Chromium, the CSP meta tag has `connect-src 'none'`.
3. Intercepts all requests to assert 0 network requests after page load.

```typescript
import { test, expect } from '@playwright/test';

test.describe('Acceptance Test T-02: Browser Gate & Air-Gapped Security', () => {
  test('unsupported browser (Firefox) displays only the Chrome/Edge requirement message', async ({ page, browserName }) => {
    test.skip(browserName !== 'firefox', 'Firefox-specific gate test');

    await page.goto('/');

    const alert = page.locator('[role="alert"]');
    await expect(alert).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /desktop chrome or edge required/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /data collection tool/i })
    ).not.toBeVisible();
  });

  test('supported browser (Chromium) contains CSP connect-src none and zero network calls', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Chromium-specific CSP test');

    const networkRequests: string[] = [];

    await page.goto('/');

    // Verify CSP meta tag
    const cspMeta = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(cspMeta).toBeTruthy();
    expect(cspMeta).toContain("connect-src 'none'");

    // Track network requests after load
    page.on('request', request => {
      const url = request.url();
      if (!url.startsWith('http://localhost:4173') && !url.startsWith('http://127.0.0.1:4173')) {
        networkRequests.push(url);
      }
    });

    // Verify app UI rendered
    await expect(
      page.getByRole('heading', { name: /data collection tool/i })
    ).toBeVisible();

    expect(networkRequests).toEqual([]);
  });
});
```

---

## 6. Worker Implementation Plan (Step-by-Step)

The Worker should execute the following discrete steps in order:

1. **Create Package Manifest & Configuration Files**:
   - Write `package.json` with the exact dependencies and scripts.
   - Run `npm install` to generate `package-lock.json`.
   - Write `tsconfig.json`.
   - Write `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`.
   - Write `tailwind.config.js`, `postcss.config.js`, `eslint.config.js`.

2. **Create Core Application Files**:
   - Write `index.html` with Content Security Policy (`connect-src 'none'`).
   - Create `src/types/mp4box.d.ts` and `src/types/filesystem.d.ts`.
   - Create `src/styles/index.css`.
   - Create `src/app/BrowserGate.tsx` and `src/app/App.tsx`.
   - Create `src/main.tsx`.

3. **Create Testing Infrastructure**:
   - Create `tests/setup.ts`.
   - Create `tests/unit/browserGate.test.tsx`.
   - Create `e2e/browser-gate.spec.ts`.

4. **Execute Verification Commands**:
   - Run `npm run lint` -> verify 0 errors, 0 warnings.
   - Run `tsc --noEmit` -> verify 0 type errors.
   - Run `npm test` -> verify 100% pass on Vitest unit tests.
   - Run `npm run build` -> verify clean Vite static build in `dist/`.
   - Run `npm run e2e` -> verify Playwright passes on both Chromium and Firefox.
   - Run `python -m unittest tools/test_validate_export.py` -> verify 20 tests pass.

---

## 7. Quality Gate Checklist for Milestone 1 Completion

- [x] Package manifest adheres to React 18, Vite static build, and exact libraries specified in AGENTS.md.
- [x] `@testing-library/react` pinned to `^14.3.1` (or `^15.x`) to prevent React 19 peer conflict.
- [x] `index.html` contains CSP `connect-src 'none'`.
- [x] TypeScript compiler strictness configured (`strict: true`, `noImplicitAny: true`).
- [x] ESLint enforces `@typescript-eslint/no-explicit-any: error`.
- [x] Ambient type definitions provided for `mp4box` without `any`.
- [x] Browser Gate component renders requirement screen when `window.showDirectoryPicker` is absent.
- [x] Playwright E2E verifies Firefox gate and Chromium zero-network CSP enforcement (T-02).
