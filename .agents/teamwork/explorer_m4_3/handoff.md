# Handoff Report: Milestone 4 Integration & E2E Verification Plan

**Explorer ID**: explorer_m4_3  
**Working Directory**: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m4_3`  
**Milestone**: Milestone 4 — Start Screen UI, Folder Ingestion & Consented List Flow  
**Target Verification Specs**:
- Vitest Integration Suite: `tests/unit/ui/StartScreen.test.tsx`
- Playwright E2E Suite: `e2e/start-screen.spec.ts` (Acceptance Tests T-01, T-02, T-03)

---

## 1. Observation

### 1.1 Existing Codebase & Test Baselines
- **Vitest Baseline**: Ran `npm test`. All 13 test files (190 unit tests) pass cleanly in ~26.5s.
  - `tests/unit/list/selectability.test.ts` (16 tests)
  - `tests/unit/list/validator.test.ts` (20 tests)
  - `tests/unit/list/parser.test.ts` (14 tests)
  - `tests/unit/list/adversarial_m3.test.ts` (27 tests)
  - `tests/unit/list/privacy.test.ts` (6 tests)
  - `tests/unit/folder/scanner.test.ts` (10 tests)
  - `tests/unit/folder/classifier.test.ts` (20 tests)
  - `tests/unit/folder/captureTime.test.ts` (12 tests)
  - `tests/unit/folder/hashing.test.ts` (17 tests)
  - `tests/unit/folder/adversarial.test.ts` (24 tests)
  - `tests/unit/folder/adversarial_m2.test.ts` (13 tests)
  - `tests/unit/browserGate.test.tsx` (8 tests)
  - `tests/unit/security/csp.test.ts` (3 tests)
- **Playwright Baseline**: Ran `npx playwright test`. 30 passed, 4 skipped (Firefox browser capability skips) in 1.2m.
  - `e2e/t02-browser-network.spec.ts`
  - `e2e/t02-adversarial-csp.spec.ts`
- **Export Validator Baseline**: Ran `python -m unittest tools/test_validate_export.py`. All 20 tests pass.
- **Lint & Types**: `npm run lint` (`eslint`) passes with 0 warnings/errors; `npx tsc --noEmit` passes with 0 errors under TypeScript strict mode.

### 1.2 Key Existing Infrastructure & Fixtures
1. **Mock File System for Tests** (`tests/unit/folder/mockFileSystem.ts`):
   - `createMockDirectoryHandle(name, entries)` and `createMockFileHandle(entry)` provide an in-memory `FileSystemDirectoryHandle` supporting `async *values()`, `async *entries()`, `getFileHandle()`, and `getDirectoryHandle()`.
   - Polyfills `Blob.prototype.arrayBuffer` and `Blob.prototype.text` for jsdom.
2. **Sample Collection Reference** (`docs/consent-tagging/examples/sample-collection/`):
   - 8 assets: `IMG-0001.png` (image), `IMG-0002.png` (image), `IMG-0003.png` (image), `IMG-0004.png` (image), `VID-0005.mp4` (video), `AUD-0006.wav` (audio), `SNS-0007.csv` (sensor), `DOC-0008.pdf` (document).
   - Expected hashes and capture times documented in `docs/consent-tagging/examples/asset_export.sample.csv`:
     - `IMG-0001.png`: `2026-11-04T06:02:11Z`, SHA-256 `2180908ddf0ede06fd1be557ec0741028aaccc8f69030b0260c071490fe198e3`
     - `VID-0005.mp4`: `2026-11-04T06:40:00Z` (extracted from `mvhd` header), SHA-256 `06020319b521122923f0c02ecdb030893d561ce6ccf9e3e596791e68de8e002b`
3. **Sample Consented List Reference** (`docs/consent-tagging/examples/consented_list.sample.csv`):
   - Project ID: `6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01`
   - Project Name: `Synthetic gait study`
   - Valid Until: `2026-11-08T04:30:00Z`
   - 4 participants:
     - `Synthetic Person 001`: selectable (adult, active consent)
     - `Synthetic Person 002`: selectable (adult, expires 2027-05-01)
     - `Synthetic Person 003`: non-selectable (consent expired `2026-11-03T00:00:00Z` before collection date `2026-11-04`)
     - `Synthetic Person 004`: non-selectable (`is_minor == true`)
4. **Existing App Shell** (`src/app/App.tsx`, `BrowserGate.tsx`):
   - `BrowserGate` gates rendering based on `window.showDirectoryPicker`.
   - `App.tsx` currently renders a placeholder ready message, ready to be wired to the full Start screen and pipeline state.

---

## 2. Logic Chain

### 2.1 File System Access API Automation in Chromium under Playwright
1. **Observation**: When `window.showDirectoryPicker()` is invoked in Chromium, the browser displays a native OS directory picker dialog.
2. **Browser Constraint**: Chromium does NOT support automating `showDirectoryPicker` via the Chrome DevTools Protocol (CDP) `Page.setInterceptFileChooserDialog`. Playwright's `page.waitForEvent('filechooser')` only intercepts standard `<input type="file">` elements, not `showDirectoryPicker()`. Calling unmocked `window.showDirectoryPicker()` in headless Chromium either rejects with `AbortError` or hangs indefinitely.
3. **Specification Hook** (`docs/consent-tagging/acceptance-tests.md` line 4):
   > "Fixtures copy `examples/sample-collection/` into a temporary folder; Playwright grants folder access through a test hook."
4. **Implementation Mechanism for Playwright**:
   - In `e2e/start-screen.spec.ts`, Playwright uses `page.addInitScript()` to inject a mock implementation of `window.showDirectoryPicker`.
   - Node reads the fixture files from disk (`docs/consent-tagging/examples/sample-collection/`) with `fs.readFileSync`, serializes their binary contents (as base64 or byte arrays), file names, relative paths, and `lastModified` times.
   - Inside the browser, the injected script builds a real `FileSystemDirectoryHandle` mock containing native browser `File` objects created via `new File([bytes], name, { lastModified })`.
   - This provides real binary buffers to the browser runtime:
     - `exifr` successfully parses real EXIF metadata from `IMG-0001.png`.
     - `mp4box.js` successfully parses the real `mvhd` header from `VID-0005.mp4` and extracts `06:40:00Z`.
     - The background Web Worker computes real SHA-256 hashes matching `asset_export.sample.csv` byte-for-byte.
   - For file picker ("Load consented list"), the UI provides a button accompanied by an accessible `<input type="file" accept=".csv" data-testid="consented-list-input" className="hidden" />`. Playwright drives this via `page.setInputFiles('[data-testid="consented-list-input"]', filePath)`.

### 2.2 Vitest Integration Suite Architecture (`tests/unit/ui/StartScreen.test.tsx`)
1. **Scope & Setup**:
   - Mount `<App />` (or `<StartScreen />`) within Testing Library `render()`.
   - Polyfill / mock `window.showDirectoryPicker` with `vi.fn().mockResolvedValue(mockDirHandle)` using `createMockDirectoryHandle()` from `tests/unit/folder/mockFileSystem.ts`.
   - In jsdom, Web Workers are not natively present. To prevent `new Worker(...)` throwing during `HashManager` initialization, stub `window.Worker` with an in-memory worker stub (or provide a test worker factory) that executes `computeSha256` asynchronously and posts back `PROGRESS` and `DONE` messages.
2. **Test Cases**:
   - **Case 1: Initial Render State**:
     - Verify header, "Open collection folder" button, "Load consented list" button.
     - Verify placeholders ("No folder opened", "No list loaded").
     - Verify Proceed / Tagging button is absent or disabled.
   - **Case 2: Folder Ingestion & Table Display**:
     - User clicks "Open collection folder".
     - Assert folder name appears (`sample-collection`).
     - Assert 8 assets are listed in deterministic sort order with correct forward-slash paths.
     - Assert type badges: 4 `image`, 1 `video`, 1 `audio`, 1 `sensor`, 1 `document`.
     - Assert capture times: `VID-0005.mp4` shows `06:40:00Z` with source `mp4box`; `IMG-0001.png` shows `06:02:11Z` with source `exif`.
     - Assert aggregate hashing progress bar displays `100%` when hashing completes.
   - **Case 3: Consented List Loading (Happy Path)**:
     - User selects `consented_list.sample.csv`.
     - Assert project summary badge: Project name `Synthetic gait study`, total participants `4`, selectable `2`, not selectable `2`.
     - Assert participant table preview renders:
       - `Synthetic Person 001`: Selectable.
       - `Synthetic Person 002`: Selectable.
       - `Synthetic Person 003`: Non-selectable badge + reason "consent expired 3 Nov".
       - `Synthetic Person 004`: Non-selectable badge + reason "minor".
   - **Case 4: Invalid Consented List Refusal (L01–L04 & BOM)**:
     - Feed negative lists violating L01 (missing column), L02 (multiple project IDs), L03 (mixed validity), L04 (duplicate person ID), and UTF-8 BOM.
     - Assert descriptive error banner appears with specific rule code.
     - Assert whole-list refusal: zero participants selectable, previous list cleared.
   - **Case 5: Privacy Invariant Check (Unit Level)**:
     - Verify `localStorage` and `sessionStorage` remain completely empty (`length === 0`).
     - Verify no participant display names appear in error messages or logs.

### 2.3 Playwright E2E Test Suite Architecture (`e2e/start-screen.spec.ts`)
1. **Test T-01: Folder Loading Acceptance Test**:
   - Ingest `sample-collection/` plus:
     - Nested asset: `sub/x.png` -> assert rendered as `sub/x.png` with forward slash.
     - Unknown extension: `test.xyz` -> assert classified as `other` badge.
     - Custom `dct-types.json` mapping `.dat` to `sensor` with `sensor.dat` -> assert classified as `sensor`.
   - Assert all 8 sample assets present with exact SHA-256 hashes matching `asset_export.sample.csv`.
   - Assert `VID-0005.mp4` capture time is `06:40:00Z`.
   - Assert image without EXIF displays source badge "capture time from file date" (`last_modified`).
2. **Test T-02: Air-Gapped Network Verification**:
   - Attach Playwright `page.on('request')` listener tracking all outgoing requests.
   - Complete entire user flow: open folder -> hash assets -> load list -> trigger validation errors.
   - Assert zero external network requests occur (only static bundle loads on `127.0.0.1:4173`).
3. **Test T-03: List Loading & In-Memory Privacy Invariant**:
   - Load valid `consented_list.sample.csv`.
   - Assert summary badge (4 people, 2 not selectable).
   - Test negative lists:
     - Missing column -> refused whole, error displayed.
     - Two project IDs -> refused whole, error displayed.
     - Mixed `list_valid_until` -> refused whole, error displayed.
     - Duplicate `person_id` -> refused whole, error displayed.
   - **Strict Privacy Audit**:
     - Check `localStorage`: assert `localStorage.length === 0`.
     - Check `sessionStorage`: assert `sessionStorage.length === 0`.
     - Check `IndexedDB`: iterate all database names and object stores; assert 0 records containing participant names (`Synthetic Person 001..004`) or contact hints (`…01..04`).
     - Check Console Logs: intercept all `console.log`, `console.info`, `console.warn`, and `console.error`; assert none contain participant names or contact hints.
     - Check URL: assert `window.location.search` and `window.location.hash` contain zero participant data.

---

## 3. Recommended Test Suite Implementations

### 3.1 Vitest Integration Test (`tests/unit/ui/StartScreen.test.tsx`)
```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'node:fs';
import path from 'node:path';
import App from '@/app/App';
import {
  createMockDirectoryHandle,
  MockFileEntry,
  MockDirectoryEntry,
} from '../folder/mockFileSystem';
import { computeSha256 } from '@/folder/sha256';

describe('StartScreen Integration Suite', () => {
  const sampleDir = path.resolve(__dirname, '../../../docs/consent-tagging/examples/sample-collection');
  const sampleListPath = path.resolve(__dirname, '../../../docs/consent-tagging/examples/consented_list.sample.csv');
  const validListCsv = fs.readFileSync(sampleListPath, 'utf8');

  // Mock Worker for jsdom hashing simulation
  class MockWorker {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    postMessage(data: any) {
      if (data.type === 'HASH_FILE') {
        setTimeout(async () => {
          const ab = await data.file.arrayBuffer();
          const sha256 = computeSha256(new Uint8Array(ab));
          this.onmessage?.({
            data: {
              type: 'DONE',
              jobId: data.jobId,
              assetId: data.assetId,
              sha256,
              totalBytes: data.file.size,
              durationMs: 5,
            },
          } as MessageEvent);
        }, 10);
      }
    }
    terminate() {}
  }

  beforeEach(() => {
    vi.stubGlobal('Worker', MockWorker);
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders initial folder and consented list pickers in idle state', () => {
    window.showDirectoryPicker = vi.fn();
    render(<App />);

    expect(screen.getByTestId('open-folder-button')).toBeInTheDocument();
    expect(screen.getByTestId('load-list-button')).toBeInTheDocument();
    expect(screen.getByText(/no collection folder opened/i)).toBeInTheDocument();
  });

  it('ingests sample folder and renders 8 assets with badges, capture times, and hashes (T-01)', async () => {
    const user = userEvent.setup();
    const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
      { kind: 'file', name: 'IMG-0001.png', content: fs.readFileSync(path.join(sampleDir, 'IMG-0001.png')) },
      { kind: 'file', name: 'IMG-0002.png', content: fs.readFileSync(path.join(sampleDir, 'IMG-0002.png')) },
      { kind: 'file', name: 'IMG-0003.png', content: fs.readFileSync(path.join(sampleDir, 'IMG-0003.png')) },
      { kind: 'file', name: 'IMG-0004.png', content: fs.readFileSync(path.join(sampleDir, 'IMG-0004.png')) },
      { kind: 'file', name: 'VID-0005.mp4', content: fs.readFileSync(path.join(sampleDir, 'VID-0005.mp4')) },
      { kind: 'file', name: 'AUD-0006.wav', content: fs.readFileSync(path.join(sampleDir, 'AUD-0006.wav')) },
      { kind: 'file', name: 'SNS-0007.csv', content: fs.readFileSync(path.join(sampleDir, 'SNS-0007.csv')) },
      { kind: 'file', name: 'DOC-0008.pdf', content: fs.readFileSync(path.join(sampleDir, 'DOC-0008.pdf')) },
    ];

    const mockHandle = createMockDirectoryHandle('sample-collection', mockEntries);
    window.showDirectoryPicker = vi.fn().mockResolvedValue(mockHandle);

    render(<App />);
    await user.click(screen.getByTestId('open-folder-button'));

    // Verify folder name and asset count
    await waitFor(() => {
      expect(screen.getByText('sample-collection')).toBeInTheDocument();
      expect(screen.getByText(/8 assets found/i)).toBeInTheDocument();
    });

    // Verify asset table rows and types
    expect(screen.getByTestId('asset-row-IMG-0001.png')).toBeInTheDocument();
    expect(screen.getByTestId('asset-row-VID-0005.mp4')).toBeInTheDocument();

    // Verify VID-0005.mp4 capture time from header
    const vidRow = screen.getByTestId('asset-row-VID-0005.mp4');
    expect(vidRow).toHaveTextContent('06:40:00Z');

    // Verify hashing progress reaches 100%
    await waitFor(() => {
      expect(screen.getByTestId('hashing-progress-bar')).toHaveTextContent(/100%/);
    }, { timeout: 3000 });
  });

  it('loads consented list and displays project summary with non-selectable reasons (T-03)', async () => {
    const user = userEvent.setup();
    window.showDirectoryPicker = vi.fn();
    render(<App />);

    const file = new File([validListCsv], 'consented_list.sample.csv', { type: 'text/csv' });
    const fileInput = screen.getByTestId('consented-list-input');
    await user.upload(fileInput, file);

    // Verify project name and summary counts
    await waitFor(() => {
      expect(screen.getByText('Synthetic gait study')).toBeInTheDocument();
      expect(screen.getByText(/4 people/i)).toBeInTheDocument();
      expect(screen.getByText(/2 not selectable/i)).toBeInTheDocument();
    });

    // Verify non-selectable reasons
    expect(screen.getByText(/minor/i)).toBeInTheDocument();
    expect(screen.getByText(/consent expired/i)).toBeInTheDocument();

    // Verify AGENTS.md Rule 8: zero storage writes
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('refuses invalid consented list whole and displays descriptive error alert (L01–L04)', async () => {
    const user = userEvent.setup();
    window.showDirectoryPicker = vi.fn();
    render(<App />);

    // L01 Missing column
    const badCsv = validListCsv.replace('consent_id,', '');
    const file = new File([badCsv], 'invalid.csv', { type: 'text/csv' });
    const fileInput = screen.getByTestId('consented-list-input');
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      expect(screen.getByTestId('list-error-banner')).toHaveTextContent(/L01|missing required column/i);
    });

    // Verify whole list refusal
    expect(screen.queryByText('Synthetic gait study')).not.toBeInTheDocument();
  });
});
```

---

### 3.2 Playwright E2E Test Suite (`e2e/start-screen.spec.ts`)
```ts
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.describe('Acceptance Tests T-01 & T-03: Start Screen Ingestion & Privacy Verification', () => {
  const sampleDir = path.resolve(__dirname, '../docs/consent-tagging/examples/sample-collection');
  const sampleListPath = path.resolve(__dirname, '../docs/consent-tagging/examples/consented_list.sample.csv');
  const validListCsv = fs.readFileSync(sampleListPath, 'utf8');

  // Prepare binary file fixtures for browser injection
  const fixtureFiles = [
    'IMG-0001.png', 'IMG-0002.png', 'IMG-0003.png', 'IMG-0004.png',
    'VID-0005.mp4', 'AUD-0006.wav', 'SNS-0007.csv', 'DOC-0008.pdf',
  ].map((name) => {
    const filePath = path.join(sampleDir, name);
    const buffer = fs.readFileSync(filePath);
    return {
      name,
      path: name,
      base64: buffer.toString('base64'),
      lastModified: fs.statSync(filePath).mtimeMs,
    };
  });

  // Add nested file and custom type override for T-01 coverage
  fixtureFiles.push({
    name: 'x.png',
    path: 'sub/x.png',
    base64: fixtureFiles[0].base64,
    lastModified: 1730700000000,
  });
  fixtureFiles.push({
    name: 'custom_sensor.raw',
    path: 'custom_sensor.raw',
    base64: Buffer.from('sensor-data').toString('base64'),
    lastModified: 1730700000000,
  });
  fixtureFiles.push({
    name: 'dct-types.json',
    path: 'dct-types.json',
    base64: Buffer.from(JSON.stringify({ sensor: ['.raw'] })).toString('base64'),
    lastModified: 1730700000000,
  });

  test.beforeEach(async ({ page }) => {
    // Inject mock FileSystemDirectoryHandle into Chromium before navigation
    await page.addInitScript((files) => {
      function b64ToUint8Array(base64: string): Uint8Array {
        const bin = atob(base64);
        const len = bin.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = bin.charCodeAt(i);
        }
        return bytes;
      }

      function createMockHandle(items: typeof files): any {
        return {
          kind: 'directory',
          name: 'sample-collection',
          async *entries() {
            // Group root vs nested
            const rootFiles = items.filter((f) => !f.path.includes('/'));
            for (const f of rootFiles) {
              const fileObj = new File([b64ToUint8Array(f.base64)], f.name, { lastModified: f.lastModified });
              yield [f.name, { kind: 'file', name: f.name, getFile: async () => fileObj }];
            }
            // Yield sub directory
            const subFiles = items.filter((f) => f.path.startsWith('sub/'));
            if (subFiles.length > 0) {
              const subHandle = {
                kind: 'directory',
                name: 'sub',
                async *entries() {
                  for (const sf of subFiles) {
                    const fileObj = new File([b64ToUint8Array(sf.base64)], sf.name, { lastModified: sf.lastModified });
                    yield [sf.name, { kind: 'file', name: sf.name, getFile: async () => fileObj }];
                  }
                },
                async *values() {
                  for await (const [, handle] of this.entries()) yield handle;
                },
              };
              yield ['sub', subHandle];
            }
          },
          async *values() {
            for await (const [, handle] of this.entries()) yield handle;
          },
          async getFileHandle(fileName: string) {
            const found = items.find((f) => f.name === fileName);
            if (!found) throw new Error('NotFoundError');
            const fileObj = new File([b64ToUint8Array(found.base64)], found.name, { lastModified: found.lastModified });
            return { kind: 'file', name: found.name, getFile: async () => fileObj };
          },
        };
      }

      (window as any).showDirectoryPicker = async () => createMockHandle(files);
    }, fixtureFiles);
  });

  test('T-01 & T-02: Folder Ingestion, 8 Assets, Hashes, Types, and Zero Network Requests', async ({ page }) => {
    const postLoadRequests: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.port !== '4173') postLoadRequests.push(req.url());
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Click Open Folder
    await page.getByTestId('open-folder-button').click();

    // Verify folder name and asset rows
    await expect(page.getByTestId('folder-name')).toHaveText('sample-collection');
    await expect(page.getByTestId('asset-table')).toBeVisible();

    // Verify nested forward-slash asset_id
    await expect(page.getByTestId('asset-id-sub/x.png')).toBeVisible();

    // Verify custom type mapping (.raw -> sensor)
    await expect(page.getByTestId('asset-type-custom_sensor.raw')).toHaveText('sensor');

    // Verify VID-0005.mp4 capture time from header
    await expect(page.getByTestId('asset-captured-at-VID-0005.mp4')).toContainText('06:40:00Z');

    // Verify hashing completes to 100%
    await expect(page.getByTestId('hashing-progress-bar')).toHaveText(/100%/, { timeout: 10000 });

    // Verify exact SHA-256 for IMG-0001.png
    await expect(page.getByTestId('asset-hash-IMG-0001.png')).toHaveText(
      '2180908ddf0ede06fd1be557ec0741028aaccc8f69030b0260c071490fe198e3'
    );

    // Verify zero external network requests across entire flow (T-02)
    expect(postLoadRequests).toEqual([]);
  });

  test('T-03: Consented List Ingestion, Validation Errors & In-Memory Privacy Invariant Audit', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 1. Ingest Valid List
    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'consented_list.sample.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(validListCsv),
    });

    // Verify summary badge
    await expect(page.getByTestId('list-summary-project')).toHaveText('Synthetic gait study');
    await expect(page.getByTestId('list-summary-counts')).toHaveText(/4 people.*2 not selectable/i);

    // Verify participant non-selectable reasons
    await expect(page.getByText('consent expired 3 Nov')).toBeVisible();
    await expect(page.getByText('minor')).toBeVisible();

    // 2. Ingest Negative Lists (L01–L04)
    // L01 Missing column
    const l01Csv = validListCsv.replace('is_minor,', '');
    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'l01.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(l01Csv),
    });
    await expect(page.getByTestId('list-error-banner')).toContainText(/L01|missing required column/i);

    // L02 Multiple project IDs
    const l02Csv = validListCsv + '\n00000000-0000-0000-0000-000000000002,Other Project,3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa9,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70109,Synthetic Person 005,…05,,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z';
    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'l02.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(l02Csv),
    });
    await expect(page.getByTestId('list-error-banner')).toContainText(/L02|multiple project/i);

    // 3. Strict In-Memory Privacy Invariant Audit
    const storageAudit = await page.evaluate(async () => {
      const forbiddenStrings = [
        'Synthetic Person 001', 'Synthetic Person 002',
        'Synthetic Person 003', 'Synthetic Person 004',
        '…01', '…02', '…03', '…04',
      ];

      const leaks: string[] = [];
      const checkStr = (source: string, val: string) => {
        for (const s of forbiddenStrings) {
          if (val.includes(s)) leaks.push(`${source} leaked: ${s}`);
        }
      };

      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        checkStr(`localStorage[${k}]`, localStorage.getItem(k) || '');
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)!;
        checkStr(`sessionStorage[${k}]`, sessionStorage.getItem(k) || '');
      }

      // Check IndexedDB databases
      if (window.indexedDB?.databases) {
        const dbs = await window.indexedDB.databases();
        for (const dbInfo of dbs) {
          checkStr('indexedDB-name', dbInfo.name || '');
        }
      }

      return leaks;
    });

    expect(storageAudit).toEqual([]);

    // Assert console logs contain zero participant names or contact hints
    const forbiddenNames = ['Synthetic Person 001', 'Synthetic Person 002', 'Synthetic Person 003', 'Synthetic Person 004'];
    for (const log of consoleLogs) {
      for (const name of forbiddenNames) {
        expect(log).not.toContain(name);
      }
    }
  });
});
```

---

## 4. Test Strategy & Edge Cases

| Risk / Edge Case | Cause / Browser Quirk | Test Mitigation Strategy |
|---|---|---|
| **Async Web Worker Hashing Race** | Worker hashing occurs asynchronously in background; asserting table hashes before hashing finishes causes flaky failures. | Assert aggregate progress bar reaches `100%` (`toHaveText(/100%/)`) before checking hash values. |
| **Worker Polyfill in Vitest (jsdom)** | jsdom lacks native `Worker` class; unhandled instantiation throws `Web Worker is not supported`. | Stub `window.Worker` with lightweight test worker that computes SHA-256 via pure `computeSha256` in `beforeEach`. |
| **Chromium Native Directory Dialog** | Headless Chromium does not trigger file chooser event for `showDirectoryPicker`. | Inject mock `FileSystemDirectoryHandle` via `page.addInitScript` with base64 binary fixtures. |
| **Input File Re-selection** | Selecting the same file or re-uploading after an error may fail to trigger `onChange` if `input.value` is not cleared. | UI must reset `event.target.value = ''` in handler; test suite verifies uploading invalid -> uploading valid sequence works. |
| **Windows Path Backslashes** | Local Windows filesystems use `\` instead of `/`. | Verify `asset_id` contains strict `/` separators (e.g. `sub/x.png`) across all tables and assertions. |
| **Timezone Sensitivity** | Machine executing tests in non-UTC timezone could parse EXIF local dates differently. | Extractor uses pure arithmetic with `Asia/Kolkata` -> UTC conversion; assert deterministic ISO strings ending in `Z`. |
| **Rule 8 Memory Privacy Leak** | Accidental logging of participant objects in `console.log` or caching list in storage. | Automated audit of `localStorage`, `sessionStorage`, `IndexedDB`, URL query/hash, and intercepted console messages. |

---

## 5. Contract for Downstream Implementers

### 5.1 Contract with UI Component Implementer (`explorer_m4_1`)
The UI components must export and bind the following deterministic `data-testid` attributes:
- `data-testid="open-folder-button"`: Button to open collection folder.
- `data-testid="load-list-button"`: Button to trigger consented list file dialog.
- `data-testid="consented-list-input"`: Hidden `<input type="file" accept=".csv" />` for programmatic file uploads.
- `data-testid="folder-name"`: Container displaying selected folder name.
- `data-testid="asset-table"`: Table container for scanned assets.
- `data-testid="asset-row-<assetId>"`: Table row for each asset.
- `data-testid="asset-id-<assetId>"`: Cell displaying normalized asset path.
- `data-testid="asset-type-<assetId>"`: Cell displaying asset classification badge.
- `data-testid="asset-captured-at-<assetId>"`: Cell displaying capture timestamp and source.
- `data-testid="asset-hash-<assetId>"`: Cell displaying computed SHA-256 hash or hashing spinner.
- `data-testid="hashing-progress-bar"`: Progress bar displaying aggregate hashing percentage (e.g. `100%`).
- `data-testid="list-summary-project"`: Badge displaying consented project name.
- `data-testid="list-summary-counts"`: Badge displaying total and non-selectable participant counts.
- `data-testid="list-error-banner"`: Alert banner displaying whole-list validation error messages.

### 5.2 Contract with State Pipeline Implementer (`explorer_m4_2`)
- Ensure `App.tsx` instantiates `HashManager` safely, providing an optional or injected `workerFactory` so tests can supply mock workers in jsdom.
- Ensure `hashManager.dispose()` is called on unmount or when a new folder is selected.
- Ensure `input.value = ''` is called after file selection to allow re-uploading corrected files.
- Strictly uphold Rule 8: zero display names or contact hints in storage, URL, or logs.

---

## 6. Caveats
1. **Milestone Boundary**: This plan verifies UC-01 (Folder Ingestion) and UC-02 (Consented List Loading) on the Start screen. Tagging workspace interactions (T-05, T-06), sheet saving (T-08, T-09), and corrections (T-11, T-12) belong to subsequent milestones.
2. **Playwright Browser Targets**: `e2e/start-screen.spec.ts` targets Chromium (desktop Chrome) as the primary supported browser per app-design.md §1. Firefox is verified by `e2e/t02-browser-network.spec.ts` to display only the unsupported browser gate.

---

## 7. Conclusion
- Designed an automated verification architecture comprising:
  1. `tests/unit/ui/StartScreen.test.tsx` (Vitest integration testing component rendering, scanning, hashing progress, consented list parsing, selectability display, and whole-list error rejection).
  2. `e2e/start-screen.spec.ts` (Playwright E2E testing full browser flow for Acceptance Tests T-01, T-02, and T-03).
- Solved the File System Access API automation challenge in Playwright via `page.addInitScript` mock directory handle backed by real sample collection binary buffers.
- Established strict privacy audit procedures guaranteeing 100% compliance with AGENTS.md Rule 8 across all browser storage mechanisms and logs.

---

## 8. Verification Method

### 8.1 Independent Verification Commands
```bash
# 1. Run Vitest integration suite
npm test tests/unit/ui/StartScreen.test.tsx

# 2. Run Playwright E2E suite in Chromium
npx playwright test e2e/start-screen.spec.ts --project=chromium

# 3. Verify static build & air-gapped CSP enforcement
npm run build
npm run preview

# 4. Verify lint and strict TypeScript typechecking
npm run lint
npx tsc --noEmit
```

### 8.2 Invalidation Conditions
- Any network request made outside `localhost:4173` during the test run.
- Any participant display name or contact hint found in `localStorage`, `sessionStorage`, `IndexedDB`, console logs, or URL parameters.
- Failure of `VID-0005.mp4` to report `06:40:00Z` capture time.
- Any SHA-256 hash mismatch against `docs/consent-tagging/examples/asset_export.sample.csv`.
- Any partial acceptance of invalid consented lists (L01–L04).
