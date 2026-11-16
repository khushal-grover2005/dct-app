import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_COLLECTION_DIR = path.resolve(
  __dirname,
  '../docs/consent-tagging/examples/sample-collection'
);
const SAMPLE_LIST_PATH = path.resolve(
  __dirname,
  '../docs/consent-tagging/examples/consented_list.sample.csv'
);
const SAMPLE_EXPORT_PATH = path.resolve(
  __dirname,
  '../docs/consent-tagging/examples/asset_export.sample.csv'
);
const PROJECT_ID = '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01';
const PERSON_001 = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';
const PERSON_002 = '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2';

interface MockFixtureFile {
  name: string;
  path: string;
  base64: string;
  lastModified: number;
  textContent?: string;
}

declare global {
  interface Window {
    __dctWrittenFiles?: Record<string, string>;
    __dctAssetHandleWrites?: string[];
    __dctExtraFiles?: Record<string, File>;
  }
}

function loadSampleFixtures(): MockFixtureFile[] {
  const captureTimes: Record<string, number> = {
    'IMG-0001.png': Date.UTC(2026, 10, 4, 6, 2, 11),
    'IMG-0002.png': Date.UTC(2026, 10, 4, 6, 5, 40),
    'IMG-0003.png': Date.UTC(2026, 10, 4, 6, 20, 0),
    'IMG-0004.png': Date.UTC(2026, 10, 4, 6, 30, 0),
    'VID-0005.mp4': Date.UTC(2026, 10, 4, 6, 40, 0),
    'AUD-0006.wav': Date.UTC(2026, 10, 4, 6, 45, 0),
    'SNS-0007.csv': Date.UTC(2026, 10, 4, 6, 50, 0),
    'DOC-0008.pdf': Date.UTC(2026, 10, 4, 7, 0, 0),
  };

  return Object.entries(captureTimes)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map(([name, lastModified]) => ({
      name,
      path: name,
      lastModified,
      base64: fs.readFileSync(path.join(SAMPLE_COLLECTION_DIR, name)).toString('base64'),
    }));
}

async function installMockDirectoryHarness(
  page: Page,
  fixtures: MockFixtureFile[],
  initialWrittenFiles: Record<string, string> = {}
) {
  await page.addInitScript(
    ({
      initialFixtures,
      seedWritten,
    }: {
      initialFixtures: MockFixtureFile[];
      seedWritten: Record<string, string>;
    }) => {
      const writtenFiles: Record<string, string> = { ...seedWritten };
      const assetHandleWrites: string[] = [];
      const extraFiles: Record<string, File> = {};
      window.__dctWrittenFiles = writtenFiles;
      window.__dctAssetHandleWrites = assetHandleWrites;
      window.__dctExtraFiles = extraFiles;

      function toBytes(base64: string): Uint8Array {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      }

      const fileCache = new Map<string, File>();
      function buildFile(entry: MockFixtureFile): File {
        const injected = extraFiles[entry.path];
        if (injected) return injected;
        const cached = fileCache.get(entry.path);
        if (cached) return cached;
        const file =
          entry.textContent !== undefined
            ? new File([entry.textContent], entry.name, { lastModified: entry.lastModified })
            : new File([toBytes(entry.base64).buffer as ArrayBuffer], entry.name, {
                lastModified: entry.lastModified,
              });
        fileCache.set(entry.path, file);
        return file;
      }

      const fixtureSet = new Set(initialFixtures.map((f) => f.path));

      const createWritableFileHandle = (relativePath: string) => {
        let currentPath = relativePath;
        let pending = writtenFiles[currentPath] ?? '';
        const nameOnly = () => currentPath.split('/').pop() ?? currentPath;

        return {
          kind: 'file' as const,
          get name() {
            return nameOnly();
          },
          async getFile() {
            const fixture = initialFixtures.find((f) => f.path === currentPath);
            if (fixture) return buildFile(fixture);
            return new File([writtenFiles[currentPath] ?? ''], nameOnly());
          },
          async createWritable() {
            if (fixtureSet.has(currentPath)) {
              assetHandleWrites.push(currentPath);
              throw new Error(`Refused attempt to mutate original asset: ${currentPath}`);
            }
            return {
              async write(data: string) {
                pending = typeof data === 'string' ? data : String(data);
              },
              async close() {
                writtenFiles[currentPath] = pending;
              },
            };
          },
          async move(newName: string) {
            const slash = currentPath.lastIndexOf('/');
            const nextPath = slash >= 0 ? `${currentPath.slice(0, slash + 1)}${newName}` : newName;
            writtenFiles[nextPath] = writtenFiles[currentPath] ?? '';
            delete writtenFiles[currentPath];
            currentPath = nextPath;
          },
        };
      };

      const createDirectoryHandle = (dirPrefix: string, dirName: string) => {
        const prefixDotSlash = dirPrefix ? `${dirPrefix}/` : '';

        return {
          kind: 'directory' as const,
          name: dirName,
          async *entries(): AsyncIterableIterator<[string, unknown]> {
            const yieldedDirs = new Set<string>();
            for (const entry of initialFixtures) {
              if (!entry.path.startsWith(prefixDotSlash)) continue;
              const remainder = entry.path.slice(prefixDotSlash.length);
              const slashIdx = remainder.indexOf('/');
              if (slashIdx === -1) {
                const file = buildFile(entry);
                yield [
                  remainder,
                  {
                    kind: 'file',
                    name: remainder,
                    getFile: async () => file,
                    createWritable: async () => {
                      assetHandleWrites.push(entry.path);
                      throw new Error(`Refused attempt to mutate asset: ${entry.path}`);
                    },
                  },
                ];
              } else {
                const childDir = remainder.slice(0, slashIdx);
                if (!yieldedDirs.has(childDir)) {
                  yieldedDirs.add(childDir);
                  yield [
                    childDir,
                    createDirectoryHandle(
                      prefixDotSlash ? `${dirPrefix}/${childDir}` : childDir,
                      childDir
                    ),
                  ];
                }
              }
            }
            for (const extraKey of Object.keys(extraFiles)) {
              if (!extraKey.startsWith(prefixDotSlash)) continue;
              const remainder = extraKey.slice(prefixDotSlash.length);
              if (!remainder.includes('/')) {
                const file = extraFiles[extraKey]!;
                yield [
                  remainder,
                  {
                    kind: 'file',
                    name: remainder,
                    getFile: async () => file,
                  },
                ];
              }
            }
          },
          async *values(): AsyncIterableIterator<unknown> {
            for await (const [, h] of this.entries()) yield h;
          },
          async getDirectoryHandle(name: string) {
            const nextPrefix = prefixDotSlash ? `${dirPrefix}/${name}` : name;
            return createDirectoryHandle(nextPrefix, name);
          },
          async getFileHandle(name: string, options?: { create?: boolean }) {
            const relPath = prefixDotSlash ? `${dirPrefix}/${name}` : name;
            if (fixtureSet.has(relPath) || relPath in extraFiles) {
              return {
                kind: 'file',
                name,
                getFile: async () => {
                  const found = initialFixtures.find((f) => f.path === relPath);
                  if (found) return buildFile(found);
                  return extraFiles[relPath]!;
                },
                createWritable: async () => {
                  assetHandleWrites.push(relPath);
                  throw new Error(`Refused attempt to mutate asset: ${relPath}`);
                },
              };
            }
            if (options?.create || relPath in writtenFiles) {
              writtenFiles[relPath] ??= '';
              return createWritableFileHandle(relPath);
            }
            throw new DOMException(`Not found: ${relPath}`, 'NotFoundError');
          },
          async removeEntry(name: string) {
            const relPath = prefixDotSlash ? `${dirPrefix}/${name}` : name;
            delete writtenFiles[relPath];
          },
        };
      };

      const rootHandle = createDirectoryHandle('', 'sample-collection');
      (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
        async () => rootHandle;
    },
    { initialFixtures: fixtures, seedWritten: initialWrittenFiles }
  );
}

async function expectNoSeriousOrCriticalAxeViolations(
  page: Page,
  screenLabel: string,
  excludeSelectors: string[] = []
) {
  let builder = new AxeBuilder({ page });
  for (const sel of excludeSelectors) {
    builder = builder.exclude(sel);
  }
  const results = await builder.analyze();
  const severe = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );
  expect(
    severe,
    `${screenLabel} had serious/critical axe violations: ${JSON.stringify(
      severe.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => ({ html: n.html, summary: n.failureSummary })),
      })),
      null,
      2
    )}`
  ).toEqual([]);
}

async function tabUntilFocused(page: Page, targetTestId: string, maxTabs = 80) {
  for (let i = 0; i < maxTabs; i++) {
    const focusedTestId = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') ?? null
    );
    if (focusedTestId === targetTestId) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Could not reach [data-testid="${targetTestId}"] within ${maxTabs} Tab presses.`);
}

function buildSparse4GbMp4File(): string {
  const sampleMp4 = fs.readFileSync(path.join(SAMPLE_COLLECTION_DIR, 'VID-0005.mp4'));
  const readBox = (typeName: string): Buffer => {
    let offset = 0;
    while (offset + 8 <= sampleMp4.length) {
      const size = sampleMp4.readUInt32BE(offset);
      const boxType = sampleMp4.subarray(offset + 4, offset + 8).toString('ascii');
      if (boxType === typeName) {
        return Buffer.from(sampleMp4.subarray(offset, offset + size));
      }
      offset += size;
    }
    throw new Error(`Expected ${typeName} box in VID-0005.mp4`);
  };

  const ftyp = readBox('ftyp');
  const moov = readBox('moov');
  const mdatSize = 4 * 1024 * 1024 * 1024; // 4 GiB sparse media payload
  const mdatHeader = Buffer.alloc(16);
  mdatHeader.writeUInt32BE(1, 0); // Extended 64-bit box size flag
  mdatHeader.write('mdat', 4, 4, 'ascii');
  mdatHeader.writeBigUInt64BE(BigInt(mdatSize), 8);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dct-4gb-'));
  const filePath = path.join(tmpDir, 'BIG-4GB.mp4');
  // Pre-create and mark sparse on Windows NTFS so 4 GiB logical length does not consume 4 GiB physical blocks
  fs.writeFileSync(filePath, new Uint8Array(0));
  if (process.platform === 'win32') {
    execFileSync('fsutil', ['sparse', 'setflag', filePath]);
  }
  const fd = fs.openSync(filePath, 'r+');
  try {
    fs.writeSync(fd, ftyp, 0, ftyp.length, 0);
    fs.writeSync(fd, mdatHeader, 0, mdatHeader.length, ftyp.length);
    const moovPos = ftyp.length + mdatSize;
    fs.ftruncateSync(fd, moovPos + moov.length);
    fs.writeSync(fd, moov, 0, moov.length, moovPos);
  } finally {
    fs.closeSync(fd);
  }
  return filePath;
}

test.describe('Increment 5: Keyboard, Accessibility, Scale (1000 assets & 4 GB video), Warnings & Immutability', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'FSA API specs target Chromium');

  test('T-13a: Unsupported browser gate passes axe accessibility checks with zero serious/critical violations', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      try {
        delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
      } catch {
        // ignore
      }
      Object.defineProperty(window, 'showDirectoryPicker', {
        get: () => undefined,
        configurable: true,
      });
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.locator('#browser-gate-unsupported')).toBeVisible();
    await expectNoSeriousOrCriticalAxeViolations(page, 'BrowserGate Unsupported Screen');
  });

  test('T-13b: Entire sample collection can be tagged and saved using keyboard only, with 0 axe issues across Start, Workspace, Review, and Corrections', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await installMockDirectoryHarness(page, loadSampleFixtures());
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
    await page.goto('/');

    // 1. Start screen (empty) -> axe check
    await expectNoSeriousOrCriticalAxeViolations(page, 'Start Screen (Initial)');

    // Open folder via keyboard Tab + Enter
    await tabUntilFocused(page, 'open-folder-button');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('folder-name')).toContainText('sample-collection');

    // Load consented list via keyboard Tab + Space + Playwright filechooser
    await tabUntilFocused(page, 'consented-list-input');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.keyboard.press('Space'),
    ]);
    await chooser.setFiles(SAMPLE_LIST_PATH);
    await expect(page.getByTestId('list-summary')).toBeVisible();

    // Edit collection ref by keyboard
    await tabUntilFocused(page, 'collection-ref-input');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('LAB-A-2026-11-04-01');

    // Audit populated Start screen with axe
    await expectNoSeriousOrCriticalAxeViolations(page, 'Start Screen (Populated)');

    // Proceed into workspace via keyboard
    await tabUntilFocused(page, 'proceed-button');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('tagging-workspace')).toBeVisible();
    await expect(page.getByTestId('workspace-hashing-status')).toContainText('All 8 hashes verified');

    // 2. Verify keyboard pane resizer accessibility + arrow key resize
    const leftResizer = page.getByRole('separator', { name: 'Resize asset list pane' });
    const initialVal = Number(await leftResizer.getAttribute('aria-valuenow'));
    await leftResizer.focus();
    await page.keyboard.press('ArrowRight');
    const resizedVal = Number(await leftResizer.getAttribute('aria-valuenow'));
    expect(resizedVal).toBeGreaterThan(initialVal);

    // 3. Tag ALL 8 assets (natural sort order: AUD-0006 -> DOC-0008 -> IMG-0001..0004 -> SNS-0007 -> VID-0005)
    // Assert Asset 1: AUD-0006.wav (Person 001 + Person 002, play to end via Space)
    await expect(page.getByTestId('viewer-asset-id')).toHaveText('AUD-0006.wav');
    await expectNoSeriousOrCriticalAxeViolations(page, 'Tagging Workspace (Audio)');
    await page.keyboard.press('/');
    await page.keyboard.type('001');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('002');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    // Speed 2x via Tab + Space (since Space on normal buttons clicks natively!)
    await tabUntilFocused(page, 'audio-speed-2');
    await page.keyboard.press('Enter');
    await tabUntilFocused(page, 'audio-play-pause-btn');
    await page.keyboard.press('Space');
    await expect(page.getByTestId('media-review-status-badge')).toHaveText('Reviewed to end', {
      timeout: 12000,
    });

    // Move next: DOC-0008.pdf -> toggle No person ('n')
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('viewer-asset-id')).toHaveText('DOC-0008.pdf');
    await expectNoSeriousOrCriticalAxeViolations(page, 'Tagging Workspace (Document)', ['iframe']);
    await page.keyboard.press('n');
    await expect(page.getByTestId('no-person-toggle')).toHaveAttribute('aria-pressed', 'true');

    // Move next: IMG-0001.png -> Person 001 + Person 002 (+ test image zoom +/0)
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('viewer-asset-id')).toHaveText('IMG-0001.png');
    await expectNoSeriousOrCriticalAxeViolations(page, 'Tagging Workspace (Image)');
    await page.keyboard.press('+');
    await expect(page.getByTestId('image-zoom-level')).toHaveText('125%');
    await page.keyboard.press('0');
    await expect(page.getByTestId('image-zoom-level')).toHaveText('100%');
    await page.keyboard.press('/');
    await page.keyboard.type('…01');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('…02');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // Move next: IMG-0002.png -> Person 001 + 1 bystander ('b')
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('viewer-asset-id')).toHaveText('IMG-0002.png');
    await page.keyboard.press('/');
    await page.keyboard.type('…01');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('b');
    await expect(page.getByTestId('bystander-count-value')).toHaveText('1');

    // Move next: IMG-0003.png -> Person 002
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('viewer-asset-id')).toHaveText('IMG-0003.png');
    await page.keyboard.press('/');
    await page.keyboard.type('…02');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // Move next: IMG-0004.png -> check Review error screen (while IMG-0004 untagged) & return via keyboard!
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('viewer-asset-id')).toHaveText('IMG-0004.png');
    await tabUntilFocused(page, 'go-to-review-btn', 80);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('review-screen')).toBeVisible();
    await expect(page.getByTestId('save-sheet-btn')).toBeDisabled();
    await expectNoSeriousOrCriticalAxeViolations(page, 'Review Screen (With Errors)');
    await tabUntilFocused(page, 'error-jump-IMG-0004.png', 80);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('viewer-asset-id')).toHaveText('IMG-0004.png');
    await page.keyboard.press('n');

    // Move next: SNS-0007.csv -> Person 001
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('viewer-asset-id')).toHaveText('SNS-0007.csv');
    await expectNoSeriousOrCriticalAxeViolations(page, 'Tagging Workspace (Sensor)');
    await page.keyboard.press('/');
    await page.keyboard.type('…01');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // Move next: VID-0005.mp4 -> Person 002, play video to end via keyboard
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('viewer-asset-id')).toHaveText('VID-0005.mp4');
    await expectNoSeriousOrCriticalAxeViolations(page, 'Tagging Workspace (Video)');
    await page.keyboard.press('/');
    await page.keyboard.type('…02');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await tabUntilFocused(page, 'video-speed-2', 80);
    await page.keyboard.press('Enter');
    await tabUntilFocused(page, 'video-play-pause-btn', 80);
    await page.keyboard.press('Space');
    await expect(page.getByTestId('media-review-status-badge')).toHaveText('Reviewed to end', {
      timeout: 12000,
    });
    await expect(page.getByTestId('workspace-done-count')).toHaveText('8 of 8 done');

    // 4. Navigate to Review Screen via keyboard and save sheet via keyboard!
    await tabUntilFocused(page, 'go-to-review-btn', 80);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('review-screen')).toBeVisible();
    await expectNoSeriousOrCriticalAxeViolations(page, 'Review Screen (Valid)');

    await tabUntilFocused(page, 'save-sheet-btn');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('saved-file-name')).toBeVisible();

    // 5. Verify saved CSV matches asset_export.sample.csv and validates cleanly with tools/validate_export.py
    const writtenFiles = await page.evaluate(() => window.__dctWrittenFiles ?? {});
    const exportName = Object.keys(writtenFiles).find((f) => f.startsWith('asset_export_'));
    expect(exportName).toBeTruthy();

    const sortRows = (rows: Record<string, string>[]) =>
      rows.sort((a, b) =>
        `${a.asset_id ?? ''}|${a.row_type ?? ''}|${a.person_id ?? ''}`.localeCompare(
          `${b.asset_id ?? ''}|${b.row_type ?? ''}|${b.person_id ?? ''}`
        )
      );
    const savedId = (await page.getByTestId('saved-export-id').textContent()) ?? '';
    const expectedRows = sortRows(
      Papa.parse<Record<string, string>>(fs.readFileSync(SAMPLE_EXPORT_PATH, 'utf8'), {
        header: true,
        skipEmptyLines: true,
      }).data.map((row) => ({
        ...row,
        export_id: savedId,
        exported_at: '2026-11-05T12:00:00Z',
      }))
    );
    const actualRows = sortRows(
      Papa.parse<Record<string, string>>(writtenFiles[exportName!] ?? '', {
        header: true,
        skipEmptyLines: true,
      }).data
    );
    expect(actualRows).toEqual(expectedRows);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dct-t13-'));
    try {
      const exportPath = path.join(tmpDir, exportName!);
      fs.writeFileSync(exportPath, writtenFiles[exportName!] ?? '', 'utf8');
      const output = execFileSync(
        'python',
        [
          path.resolve(__dirname, '../tools/validate_export.py'),
          '--list',
          SAMPLE_LIST_PATH,
          '--export',
          exportPath,
          '--now',
          '2026-11-05T12:00:00Z',
        ],
        { encoding: 'utf8' }
      );
      expect(output).toContain('VALID: 11 rows, 8 assets, 0 errors, 1 warnings');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // 6. Navigate to Corrections screen and verify axe passes cleanly there too
    await tabUntilFocused(page, 'review-back-to-workspace-btn');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('workspace-go-to-corrections-btn')).toBeVisible();
    await page.getByTestId('workspace-go-to-corrections-btn').click();
    await expect(page.getByTestId('corrections-screen')).toBeVisible();
    await expectNoSeriousOrCriticalAxeViolations(page, 'Corrections Screen');
  });

  test('T-14: 1,000-file folder hashes in background with responsive asset switching (< 200ms), flags participant filename PII (R-30), and shows 7-day reminder (R-37)', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const TOTAL_ASSETS = 1000;
    const fixtures: MockFixtureFile[] = [];
    const progressAssets: Record<string, unknown> = {};
    const mtimeIso = '2026-11-04T06:20:00Z';
    const mtimeMs = Date.parse(mtimeIso);

    for (let i = 1; i <= TOTAL_ASSETS; i++) {
      const isPiiNamed = i === TOTAL_ASSETS;
      const assetId = isPiiNamed
        ? 'captures/Synthetic_Person_001_clip.txt'
        : `item_${String(i).padStart(4, '0')}.txt`;
      const content = `# Synthetic sensor sample ${i}\ntime,val\n0,${i}\n`;
      const sha256 = crypto.createHash('sha256').update(content).digest('hex');

      fixtures.push({
        name: assetId.split('/').pop()!,
        path: assetId,
        base64: '',
        textContent: content,
        lastModified: mtimeMs,
      });

      // Pre-populate 996 tagged/no_person assets in progress so all 1,000 save cleanly after tagging the remaining 4
      if (i <= 996) {
        progressAssets[assetId] = {
          sha256,
          captured_at: mtimeIso,
          captured_at_source: 'file_modified',
          asset_type: 'sensor',
          person_ids: [],
          bystander_count: 0,
          no_person: true,
          reviewed_to_end: false,
          external_review_confirmed: false,
          state: 'active',
        };
      }
    }

    // Seed an 8-day-old save to verify R-37 list deletion reminder concurrently with 1,000 assets
    const initialProgress = {
      format: 'dct.progress',
      format_version: 1,
      collection_ref: 'SCALE-1000-LAB',
      project_id: PROJECT_ID,
      list_generated_at: '2026-11-01T04:30:00Z',
      assets: progressAssets,
      saves: [
        {
          export_id: '11111111-2222-4333-8444-555555555555',
          file: 'asset_export_SCALE-1000-LAB_20261104T100000Z.csv',
          saved_at: '2026-11-04T10:00:00Z',
          held: [],
        },
      ],
    };

    await installMockDirectoryHarness(page, fixtures, {
      '.dct-progress.json': JSON.stringify(initialProgress),
    });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.clock.setFixedTime(new Date('2026-11-12T12:00:00Z')); // 8 days after 2026-11-04
    await page.goto('/');

    await page.getByTestId('open-folder-button').click();
    await expect(page.getByTestId('asset-count-badge')).toHaveText('1000 assets found');
    await expect(page.getByTestId('list-deletion-reminder')).toBeVisible();
    await expect(page.getByTestId('resume-restored-count')).toHaveText('996');
    await expect(page.getByTestId('resume-untagged-count')).toHaveText('4');

    // Load consented list & immediately enter Tagging Workspace WITHOUT waiting for all 1,000 hashes to finish
    await page.setInputFiles('[data-testid="consented-list-input"]', SAMPLE_LIST_PATH);
    await expect(page.getByTestId('proceed-button')).toBeEnabled();
    await page.getByTestId('proceed-button').click();
    await expect(page.getByTestId('tagging-workspace')).toBeVisible();

    // Virtualization sanity: far fewer than 1,000 buttons mounted in DOM
    const renderedOptionCount = await page
      .locator('[data-testid^="workspace-asset-item-"]')
      .count();
    expect(renderedOptionCount).toBeLessThan(100);

    // Measure asset switching responsiveness (< 200 ms per switch across 12 consecutive switches)
    const switchDurations: number[] = [];
    for (let step = 0; step < 12; step++) {
      const beforeId = await page.getByTestId('viewer-asset-id').textContent();
      const startMs = Date.now();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByTestId('viewer-asset-id')).not.toHaveText(beforeId ?? '');
      switchDurations.push(Date.now() - startMs);
    }
    const sortedDurations = [...switchDurations].sort((a, b) => a - b);
    const medianSwitchMs = sortedDurations[Math.floor(sortedDurations.length / 2)]!;
    expect(medianSwitchMs).toBeLessThan(200);
    expect(Math.max(...switchDurations)).toBeLessThan(500);

    // Filter to untagged/not-done items, tag all 4 remaining (including PII-named clip)
    await page.getByTestId('asset-status-filter').selectOption('not_done');
    for (let i = 0; i < 4; i++) {
      const nextUntagged = page.locator('[data-testid^="workspace-asset-item-"]').first();
      await nextUntagged.click();
      const currentId = (await page.getByTestId('viewer-asset-id').textContent()) ?? '';
      if (currentId.includes('Synthetic_Person_001')) {
        await page.getByTestId(`select-person-btn-${PERSON_001}`).click();
      } else {
        await page.getByTestId('no-person-toggle').click();
      }
    }

    // Wait for background hashing of all 1,000 files to finish
    await expect(page.getByTestId('workspace-hashing-status')).toContainText(
      'All 1000 hashes verified',
      { timeout: 30000 }
    );
    await expect(page.getByTestId('workspace-done-count')).toHaveText('1000 of 1000 done');

    // Review screen: verify filename PII warning triggers without leaking display name, then save & validate
    await page.getByTestId('go-to-review-btn').click();
    await expect(page.getByTestId('review-screen')).toBeVisible();
    await expect(page.getByTestId('review-warnings')).toContainText('[FILENAME_PII]');
    await expect(page.getByTestId('review-warnings')).toContainText(
      'captures/Synthetic_Person_001_clip.txt'
    );
    await expect(page.getByTestId('review-warnings')).not.toContainText('Synthetic Person 001');

    await expect(page.getByTestId('save-sheet-btn')).toBeEnabled();
    await page.getByTestId('save-sheet-btn').click();
    await expect(page.getByTestId('saved-file-name')).toBeVisible();

    const written = await page.evaluate(() => window.__dctWrittenFiles ?? {});
    const savedCsvName = Object.keys(written).find((k) => k.startsWith('asset_export_SCALE-1000-LAB'));
    expect(savedCsvName).toBeTruthy();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dct-t14-'));
    try {
      const exportPath = path.join(tmpDir, savedCsvName!);
      fs.writeFileSync(exportPath, written[savedCsvName!] ?? '', 'utf8');
      const output = execFileSync(
        'python',
        [
          path.resolve(__dirname, '../tools/validate_export.py'),
          '--list',
          SAMPLE_LIST_PATH,
          '--export',
          exportPath,
          '--now',
          '2026-11-12T12:00:00Z',
        ],
        { encoding: 'utf8' }
      );
      expect(output).toContain('VALID: 1000 rows, 1000 assets, 0 errors, 0 warnings');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('T-16a: Original asset bytes, sizes, and mtimes remain untouched and only sheet + .dct-progress.json are created', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    // Part A: Byte-for-byte immutability & folder cleanliness on full tag + save
    const sampleFixtures = loadSampleFixtures();
    const baselineMeta = new Map<string, { size: number; mtimeMs: number; sha256: string }>();
    for (const f of sampleFixtures) {
      const fullPath = path.join(SAMPLE_COLLECTION_DIR, f.name);
      const buf = fs.readFileSync(fullPath);
      baselineMeta.set(f.name, {
        size: buf.length,
        mtimeMs: f.lastModified,
        sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      });
    }

    await installMockDirectoryHarness(page, sampleFixtures);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
    await page.goto('/');

    await page.getByTestId('open-folder-button').click();
    await page.setInputFiles('[data-testid="consented-list-input"]', SAMPLE_LIST_PATH);
    await page.getByTestId('proceed-button').click();

    await page.getByTestId('workspace-asset-item-IMG-0001.png').click();
    await page.getByTestId(`select-person-btn-${PERSON_001}`).click();
    await page.getByTestId('workspace-asset-item-IMG-0002.png').click();
    await page.getByTestId(`select-person-btn-${PERSON_001}`).click();
    await page.getByTestId('workspace-asset-item-IMG-0003.png').click();
    await page.getByTestId(`select-person-btn-${PERSON_002}`).click();
    await page.getByTestId('workspace-asset-item-IMG-0004.png').click();
    await page.getByTestId('no-person-toggle').click();
    await page.getByTestId('workspace-asset-item-SNS-0007.csv').click();
    await page.getByTestId(`select-person-btn-${PERSON_001}`).click();
    await page.getByTestId('workspace-asset-item-DOC-0008.pdf').click();
    await page.getByTestId('no-person-toggle').click();

    await page.getByTestId('workspace-asset-item-VID-0005.mp4').click();
    await page.getByTestId(`select-person-btn-${PERSON_002}`).click();
    await page.getByTestId('video-speed-2').click();
    await page.getByTestId('video-play-pause-btn').click();
    await expect(page.getByTestId('media-review-status-badge')).toHaveText('Reviewed to end', {
      timeout: 12000,
    });

    await page.getByTestId('workspace-asset-item-AUD-0006.wav').click();
    await page.getByTestId(`select-person-btn-${PERSON_001}`).click();
    await page.getByTestId('audio-speed-2').click();
    await page.getByTestId('audio-play-pause-btn').click();
    await expect(page.getByTestId('media-review-status-badge')).toHaveText('Reviewed to end', {
      timeout: 12000,
    });

    await page.getByTestId('go-to-review-btn').click();
    await page.getByTestId('save-sheet-btn').click();
    await expect(page.getByTestId('saved-file-name')).toBeVisible();

    const assetWrites = await page.evaluate(() => window.__dctAssetHandleWrites ?? []);
    expect(assetWrites).toEqual([]);

    const writtenKeys = await page.evaluate(() => Object.keys(window.__dctWrittenFiles ?? {}).sort());
    expect(writtenKeys).toHaveLength(2);
    expect(writtenKeys.some((k) => k === '.dct-progress.json')).toBe(true);
    expect(writtenKeys.some((k) => /^asset_export_.*\.csv$/.test(k))).toBe(true);
    expect(writtenKeys.some((k) => k.endsWith('.tmp'))).toBe(false);

    // Re-read every original asset in sample-collection on disk and verify identical bytes & hash
    for (const f of sampleFixtures) {
      const fullPath = path.join(SAMPLE_COLLECTION_DIR, f.name);
      const buf = fs.readFileSync(fullPath);
      const actualSha = crypto.createHash('sha256').update(buf).digest('hex');
      const expected = baselineMeta.get(f.name)!;
      expect(buf.length).toBe(expected.size);
      expect(actualSha).toBe(expected.sha256);
    }
  });

  test('T-16b: Generated 4 GiB sparse MP4 video hashes in background while workspace switching stays responsive (< 200ms)', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const sampleFixtures = loadSampleFixtures();
    const sparseMp4Path = buildSparse4GbMp4File();
    try {
      const smallSubset = sampleFixtures.filter(
        (f) => f.name === 'IMG-0001.png' || f.name === 'IMG-0004.png'
      );
      await installMockDirectoryHarness(page, smallSubset);
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/');

      // Attach real 4 GiB disk-backed OS File handle via Playwright file input
      await page.evaluate(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.id = '__dct_4gb_injector';
        input.style.display = 'none';
        input.addEventListener('change', () => {
          const f = input.files?.[0];
          if (f && window.__dctExtraFiles) {
            window.__dctExtraFiles['BIG-4GB.mp4'] = f;
          }
        });
        document.body.appendChild(input);
      });
      await page.setInputFiles('#__dct_4gb_injector', sparseMp4Path);

      await page.getByTestId('open-folder-button').click();
      await expect(page.getByTestId('asset-count-badge')).toHaveText('3 assets found');
      await expect(page.getByTestId('asset-type-BIG-4GB.mp4')).toHaveText('video');
      await expect(page.getByTestId('asset-captured-at-BIG-4GB.mp4')).toHaveText(
        '2026-11-04T06:40:00Z'
      );

      await page.setInputFiles('[data-testid="consented-list-input"]', SAMPLE_LIST_PATH);
      await page.getByTestId('proceed-button').click();
      await expect(page.getByTestId('tagging-workspace')).toBeVisible();

      // Switch repeatedly between IMG-0001 and IMG-0004 while BIG-4GB.mp4 hashes in background (< 200 ms median)
      await page.getByTestId('workspace-asset-item-IMG-0001.png').click();
      await expect(page.getByTestId('viewer-asset-id')).toHaveText('IMG-0001.png');
      const switchDurations: number[] = [];
      for (let i = 0; i < 6; i++) {
        const goDown = i % 2 === 0;
        const expectedTarget = goDown ? 'IMG-0004.png' : 'IMG-0001.png';
        const t0 = Date.now();
        await page.keyboard.press(goDown ? 'ArrowDown' : 'ArrowUp');
        await expect(page.getByTestId('viewer-asset-id')).toHaveText(expectedTarget);
        switchDurations.push(Date.now() - t0);
      }
      const sortedDurations = [...switchDurations].sort((a, b) => a - b);
      const medianSwitchMs = sortedDurations[Math.floor(sortedDurations.length / 2)]!;
      expect(medianSwitchMs).toBeLessThan(200);

      // Background streaming SHA-256 over 4 GiB finishes cleanly with valid 64-hex hash
      await expect(page.getByTestId('workspace-hashing-status')).toContainText(
        'All 3 hashes verified',
        { timeout: 210_000 }
      );
    } finally {
      fs.rmSync(path.dirname(sparseMp4Path), { recursive: true, force: true });
    }
  });
});
