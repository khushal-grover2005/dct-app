import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Start Screen Acceptance Tests (T-01, T-02, T-03)', () => {
  // Skip on non-Chromium browsers where File System Access API is not supported
  test.skip(({ browserName }) => browserName === 'firefox', 'FSA API is not supported in Firefox');

  const sampleDir = path.resolve(__dirname, '../docs/consent-tagging/examples/sample-collection');
  const sampleListPath = path.resolve(__dirname, '../docs/consent-tagging/examples/consented_list.sample.csv');
  const validListCsv = fs.readFileSync(sampleListPath, 'utf8');

  // Exact expected hashes from docs/consent-tagging/examples/asset_export.sample.csv
  const expectedHashes: Record<string, string> = {
    'IMG-0001.png': '2180908ddf0ede06fd1be557ec0741028aaccc8f69030b0260c071490fe198e3',
    'IMG-0002.png': 'd7ccb67ce581735227576793a5ed283fe97658b7f3855985c954cef033cb928d',
    'IMG-0003.png': '8bf338500e6e1049641dd043cca6cdc1c8883f475992b5ccdfe61aaf1c2d2227',
    'IMG-0004.png': '252faa78eca702304cc17cbc026361d2c17607834b7869178174413a9fa3fd3c',
    'VID-0005.mp4': '06020319b521122923f0c02ecdb030893d561ce6ccf9e3e596791e68de8e002b',
    'AUD-0006.wav': '570475d23f0878b87d95de909a167e167297f98ad25c4061ab4ed7e59e820527',
    'SNS-0007.csv': '884016620503eb2fc868a7bb722723936bf152859da9acd610a2d175058162d4',
    'DOC-0008.pdf': '8491e3916b78e4a55b894f691ed66912a2699df2c33ceac2706d08cf4ac94aae',
  };

  // Base fixtures from sample collection
  const fixtureFiles: { name: string; path: string; base64: string; lastModified: number }[] = [
    'IMG-0001.png',
    'IMG-0002.png',
    'IMG-0003.png',
    'IMG-0004.png',
    'VID-0005.mp4',
    'AUD-0006.wav',
    'SNS-0007.csv',
    'DOC-0008.pdf',
  ].map((name) => {
    const filePath = path.join(sampleDir, name);
    const buffer = fs.readFileSync(filePath);
    return {
      name,
      path: name,
      base64: buffer.toString('base64'),
      // For IMG-0001.png, use fixed time 2026-11-04T06:02:11Z per sample collection contract
      lastModified: name === 'IMG-0001.png' ? Date.UTC(2026, 10, 4, 6, 2, 11) : Date.UTC(2026, 10, 4, 6, 0, 0),
    };
  });

  // T-01 extensions:
  // 1. Nested file: sub/x.png
  fixtureFiles.push({
    name: 'x.png',
    path: 'sub/x.png',
    base64: fixtureFiles[0]?.base64 || '',
    lastModified: Date.UTC(2026, 10, 4, 6, 0, 0),
  });

  // 2. Unknown extension: test.xyz -> maps to 'other'
  fixtureFiles.push({
    name: 'test.xyz',
    path: 'test.xyz',
    base64: Buffer.from('unknown file format content').toString('base64'),
    lastModified: Date.UTC(2026, 10, 4, 6, 0, 0),
  });

  // 3. Custom type override via dct-types.json: .dat -> sensor
  fixtureFiles.push({
    name: 'dct-types.json',
    path: 'dct-types.json',
    base64: Buffer.from(JSON.stringify({ sensor: ['.dat'] })).toString('base64'),
    lastModified: Date.UTC(2026, 10, 4, 6, 0, 0),
  });

  // 4. Custom sensor file matching override: sensor.dat -> classified as 'sensor'
  fixtureFiles.push({
    name: 'sensor.dat',
    path: 'sensor.dat',
    base64: Buffer.from('1.0,2.0,3.0').toString('base64'),
    lastModified: Date.UTC(2026, 10, 4, 6, 0, 0),
  });

  test.beforeEach(async ({ page, browserName }) => {
    if (browserName === 'firefox') return;

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

      function createMockHandle(items: typeof files): unknown {
        const handle = {
          kind: 'directory',
          name: 'sample-collection',
          async *entries() {
            const rootFiles = items.filter((f) => !f.path.includes('/'));
            for (const f of rootFiles) {
              const fileObj = new File([b64ToUint8Array(f.base64).buffer as ArrayBuffer], f.name, {
                lastModified: f.lastModified,
              });
              yield [f.name, { kind: 'file', name: f.name, getFile: async () => fileObj }];
            }

            const subFiles = items.filter((f) => f.path.startsWith('sub/'));
            if (subFiles.length > 0) {
              const subHandle = {
                kind: 'directory',
                name: 'sub',
                async *entries() {
                  for (const sf of subFiles) {
                    const fileObj = new File(
                      [b64ToUint8Array(sf.base64).buffer as ArrayBuffer],
                      sf.name,
                      {
                        lastModified: sf.lastModified,
                      }
                    );
                    yield [sf.name, { kind: 'file', name: sf.name, getFile: async () => fileObj }];
                  }
                },
                async *values() {
                  for await (const [, h] of subHandle.entries()) yield h;
                },
              };
              yield ['sub', subHandle];
            }
          },
          async *values() {
            for await (const [, h] of handle.entries()) yield h;
          },
          async getFileHandle(fileName: string) {
            const found = items.find((f) => f.name === fileName && !f.path.includes('/'));
            if (!found) {
              throw new Error(`NotFoundError: File ${fileName} not found`);
            }
            const fileObj = new File([b64ToUint8Array(found.base64).buffer as ArrayBuffer], found.name, {
              lastModified: found.lastModified,
            });
            return { kind: 'file', name: found.name, getFile: async () => fileObj };
          },
        };
        return handle;
      }

      (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
        async () => createMockHandle(files);
    }, fixtureFiles);
  });

  test('T-01 & T-02: Folder Ingestion, 8 Assets, Hashes, Types, and Zero Network Requests', async ({
    page,
  }) => {
    const postLoadRequests: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      // Ignore initial local web server asset requests on port 4173
      if (url.port !== '4173' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
        postLoadRequests.push(req.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Verify initial idle state
    await expect(page.getByTestId('open-folder-button')).toBeVisible();
    await expect(page.getByTestId('proceed-button')).toBeDisabled();

    // Open collection folder
    await page.getByTestId('open-folder-button').click();

    // Verify folder name badge
    await expect(page.getByTestId('folder-name')).toContainText('sample-collection');

    // Verify asset table is rendered
    await expect(page.getByTestId('asset-table')).toBeVisible();

    // Verify nested forward-slash asset ID (sub/x.png)
    await expect(page.getByTestId('asset-id-sub/x.png')).toBeVisible();

    // Verify unknown extension is classified as 'other'
    await expect(page.getByTestId('asset-type-test.xyz')).toHaveText('other');

    // Verify custom dct-types.json override (.dat -> sensor)
    await expect(page.getByTestId('asset-type-sensor.dat')).toHaveText('sensor');

    // Verify VID-0005.mp4 capture time from header (06:40:00Z)
    await expect(page.getByTestId('asset-captured-at-VID-0005.mp4')).toContainText('06:40:00Z');

    // Verify IMG-0001.png is marked 'capture time from file date'
    const img001Row = page.getByTestId('asset-row-IMG-0001.png');
    await expect(img001Row.getByTestId('asset-time-source-badge')).toHaveText(
      'capture time from file date'
    );

    // Verify background worker hashing completes to 100%
    await expect(page.getByTestId('hashing-progress-bar')).toHaveText(/100%/, { timeout: 15000 });

    // Verify all 8 original assets have exact matching SHA-256 hashes
    for (const [assetId, expectedSha] of Object.entries(expectedHashes)) {
      await expect(page.getByTestId(`asset-hash-${assetId}`)).toHaveText(expectedSha);
    }

    // Verify T-02: Zero external network requests occurred
    expect(postLoadRequests).toEqual([]);
  });

  test('T-03: Consented List Ingestion, Validation Errors & In-Memory Privacy Invariant Audit', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 1. Ingest Valid Consented List
    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'consented_list.sample.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(validListCsv),
    });

    // Verify summary project info
    await expect(page.getByTestId('list-summary-project')).toHaveText('Synthetic gait study');

    // Verify total count and non-selectable breakdown (4 people, 2 not selectable)
    await expect(page.getByTestId('list-summary-counts')).toHaveText(/4 people.*2 not selectable/i);

    // Verify participant non-selectable reasons in participant table
    await expect(page.getByText('consent expired 3 Nov')).toBeVisible();
    await expect(page.getByText('minor')).toBeVisible();

    // 2. Ingest Negative Lists (L01–L04)
    // L01: Missing column
    const l01Csv = validListCsv.replace('is_minor,', '');
    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'l01.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(l01Csv),
    });
    await expect(page.getByTestId('list-error-banner')).toContainText(/L01|missing required column/i);
    await expect(page.getByTestId('participant-table')).toHaveCount(0);

    // L02: Multiple project IDs
    const l02Csv =
      validListCsv +
      '\n00000000-0000-0000-0000-000000000002,Other Project,3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa9,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70109,Synthetic Person 005,…05,,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z';
    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'l02.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(l02Csv),
    });
    await expect(page.getByTestId('list-error-banner')).toContainText(/L02|multiple project/i);
    await expect(page.getByTestId('participant-table')).toHaveCount(0);

    // L03: Mixed list_valid_until
    const l03Csv = validListCsv.replace(
      '2026-11-08T04:30:00Z',
      '2026-11-09T04:30:00Z'
    );
    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'l03.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(l03Csv),
    });
    await expect(page.getByTestId('list-error-banner')).toContainText(/L03|list_valid_until/i);
    await expect(page.getByTestId('participant-table')).toHaveCount(0);

    // L04: Duplicate person_id
    const lines = validListCsv.trim().split('\n');
    const duplicateLine = lines[1];
    const l04Csv = validListCsv + '\n' + duplicateLine;
    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'l04.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(l04Csv),
    });
    await expect(page.getByTestId('list-error-banner')).toContainText(/L04|duplicate person_id/i);
    await expect(page.getByTestId('participant-table')).toHaveCount(0);

    // 3. Strict In-Memory Privacy Invariant Audit (AGENTS.md Rule 8)
    const storageAudit = await page.evaluate(async () => {
      const forbiddenStrings = [
        'Synthetic Person 001',
        'Synthetic Person 002',
        'Synthetic Person 003',
        'Synthetic Person 004',
        '…01',
        '…02',
        '…03',
        '…04',
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
    const forbiddenNames = [
      'Synthetic Person 001',
      'Synthetic Person 002',
      'Synthetic Person 003',
      'Synthetic Person 004',
      '…01',
      '…02',
      '…03',
      '…04',
    ];
    for (const log of consoleLogs) {
      for (const name of forbiddenNames) {
        expect(log).not.toContain(name);
      }
    }

    // Verify URL parameters contain zero participant data
    const currentUrl = page.url();
    for (const name of forbiddenNames) {
      expect(currentUrl).not.toContain(encodeURIComponent(name));
    }
  });
});
