import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PERSON_001 = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';
const PERSON_002 = '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2';
const PERSON_003 = 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e03';
const PERSON_004 = 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f04';

// Valid 1x1 transparent PNG
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

interface MockFixtureFile {
  name: string;
  path: string;
  base64: string;
  lastModified: number;
}

declare global {
  interface Window {
    __dctWrittenFiles?: Record<string, string>;
    __dctRemovedFiles?: string[];
  }
}

function loadSampleFixtures(extraFiles: MockFixtureFile[] = []): MockFixtureFile[] {
  const sampleDir = path.resolve(__dirname, '../docs/consent-tagging/examples/sample-collection');

  const sampleFiles: MockFixtureFile[] = [
    'IMG-0001.png',
    'IMG-0002.png',
    'IMG-0003.png',
    'IMG-0004.png',
    'VID-0005.mp4',
    'AUD-0006.wav',
    'SNS-0007.csv',
    'DOC-0008.pdf',
  ].map((name) => {
    const buffer = fs.readFileSync(path.join(sampleDir, name));
    return {
      name,
      path: name,
      base64: buffer.toString('base64'),
      lastModified: Date.UTC(2026, 10, 4, 6, 2, 11),
    };
  });

  return [...sampleFiles, ...extraFiles];
}

async function installWritableMockDirectory(
  page: import('@playwright/test').Page,
  fixtures: MockFixtureFile[]
) {
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

    const writtenFiles: Record<string, string> = {};
    const removedFiles: string[] = [];
    window.__dctWrittenFiles = writtenFiles;
    window.__dctRemovedFiles = removedFiles;

    const createWritableHandle = (initialName: string) => {
      let currentName = initialName;
      let pendingData = writtenFiles[currentName] ?? '';

      return {
        kind: 'file' as const,
        get name() {
          return currentName;
        },
        async getFile() {
          const text = writtenFiles[currentName] ?? '';
          return new File([text], currentName, { type: 'application/json' });
        },
        async createWritable() {
          return {
            async write(data: string) {
              pendingData = typeof data === 'string' ? data : String(data);
            },
            async close() {
              writtenFiles[currentName] = pendingData;
            },
          };
        },
        async move(newName: string) {
          const content = writtenFiles[currentName] ?? pendingData;
          delete writtenFiles[currentName];
          currentName = newName;
          writtenFiles[newName] = content;
        },
      };
    };

    const handle = {
      kind: 'directory',
      name: 'sample-collection',
      async *entries() {
        for (const f of files) {
          const bytes = b64ToUint8Array(f.base64);
          const fileObj = new File([bytes.buffer as ArrayBuffer], f.name, {
            lastModified: f.lastModified,
          });
          yield [f.name, { kind: 'file', name: f.name, getFile: async () => fileObj }];
        }
      },
      async *values() {
        for await (const [, h] of handle.entries()) {
          yield h;
        }
      },
      async getFileHandle(fileName: string, opts?: { create?: boolean }) {
        if (opts?.create || fileName in writtenFiles) {
          if (!(fileName in writtenFiles)) {
            writtenFiles[fileName] = '';
          }
          return createWritableHandle(fileName);
        }
        const found = files.find((f) => f.name === fileName);
        if (!found) {
          throw new Error(`NotFoundError: File ${fileName} not found`);
        }
        const bytes = b64ToUint8Array(found.base64);
        const fileObj = new File([bytes.buffer as ArrayBuffer], found.name, {
          lastModified: found.lastModified,
        });
        return { kind: 'file', name: found.name, getFile: async () => fileObj };
      },
      async removeEntry(fileName: string) {
        delete writtenFiles[fileName];
        removedFiles.push(fileName);
      },
    };

    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
      async () => handle;
  }, fixtures);
}

test.describe('Increment 2: Tagging Workspace & Multi-Modal Viewers (T-04, T-05, T-06, T-15)', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'FSA API is not supported in Firefox');

  const sampleListPath = path.resolve(
    __dirname,
    '../docs/consent-tagging/examples/consented_list.sample.csv'
  );
  const validListCsv = fs.readFileSync(sampleListPath, 'utf8');

  async function openWorkspace(page: import('@playwright/test').Page) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));

    await page.goto('/');
    await page.getByTestId('open-folder-button').click();
    await expect(page.getByTestId('folder-name')).toContainText('sample-collection');

    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'consented_list.sample.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(validListCsv),
    });

    await expect(page.getByTestId('proceed-button')).toBeEnabled();
    await page.getByTestId('proceed-button').click();
    await expect(page.getByTestId('tagging-workspace')).toBeVisible();
  }

  test('T-04, T-05 & T-06: Selectability gating, search, duplicate/removal, bystander-only warning & state filters', async ({
    page,
  }) => {
    const fixtures = loadSampleFixtures([
      {
        name: 'IMG-POST-EXPIRY.png',
        path: 'IMG-POST-EXPIRY.png',
        base64: TINY_PNG_B64,
        lastModified: Date.UTC(2026, 10, 10, 12, 0, 0), // After 2026-11-08T04:30:00Z
      },
    ]);
    await installWritableMockDirectory(page, fixtures);
    await openWorkspace(page);

    // T-04: On IMG-0001.png, Person 003 expired (3 Nov) & Person 004 minor show reasons and NO Select button
    await page.getByTestId('workspace-asset-item-IMG-0001.png').click();
    await expect(page.getByTestId(`select-person-btn-${PERSON_001}`)).toBeVisible();
    await expect(page.getByTestId(`select-person-btn-${PERSON_002}`)).toBeVisible();

    const row003 = page.getByTestId(`people-list-row-${PERSON_003}`);
    await expect(row003.getByTestId(`non-selectable-reason-${PERSON_003}`)).toHaveText(
      'consent expired 3 Nov'
    );
    await expect(row003.getByRole('button', { name: /select/i })).toHaveCount(0);

    const row004 = page.getByTestId(`people-list-row-${PERSON_004}`);
    await expect(row004.getByTestId(`non-selectable-reason-${PERSON_004}`)).toHaveText('minor');
    await expect(row004.getByRole('button', { name: /select/i })).toHaveCount(0);

    // T-04 / R-12: Asset captured after list_valid_until -> nobody selectable & prompts for newer list
    await page.getByTestId('workspace-asset-item-IMG-POST-EXPIRY.png').click();
    await expect(page.getByTestId('list-expired-asset-banner')).toBeVisible();
    await expect(
      page.getByTestId('participant-select-list').getByRole('button', { name: /select/i })
    ).toHaveCount(0);

    // Return to IMG-0001.png for T-05
    await page.getByTestId('workspace-asset-item-IMG-0001.png').click();

    // T-05 / R-13: Verify zero input/textarea fields exist for person_id, consent_id, project_id, export_id
    const idInputsCount = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      return inputs.filter((el) => {
        const meta = `${el.id} ${el.getAttribute('name') ?? ''} ${el.getAttribute('placeholder') ?? ''} ${el.getAttribute('data-testid') ?? ''}`.toLowerCase();
        return (
          meta.includes('person_id') ||
          meta.includes('consent_id') ||
          meta.includes('project_id') ||
          meta.includes('export_id')
        );
      }).length;
    });
    expect(idInputsCount).toBe(0);

    // T-05: Search by contact hint '…01', select once via Enter, press Enter again -> still 1 chip, remove & re-add
    const searchInput = page.getByTestId('participant-search-input');
    await searchInput.fill('…01');
    await expect(page.getByTestId(`people-list-row-${PERSON_001}`)).toBeVisible();
    await expect(page.getByTestId(`people-list-row-${PERSON_002}`)).toHaveCount(0);

    await searchInput.press('Enter');
    await expect(page.getByTestId(`selected-person-chip-${PERSON_001}`)).toHaveCount(1);
    await searchInput.press('Enter');
    await expect(page.getByTestId(`selected-person-chip-${PERSON_001}`)).toHaveCount(1);

    await page.getByTestId(`remove-person-btn-${PERSON_001}`).click();
    await expect(page.getByTestId(`selected-person-chip-${PERSON_001}`)).toHaveCount(0);

    await page.getByTestId(`select-person-btn-${PERSON_001}`).click();
    await expect(page.getByTestId(`selected-person-chip-${PERSON_001}`)).toHaveCount(1);
    await searchInput.fill('');

    // T-06: "No person" disabled while Person 001 is selected; done count updates to 1 of 9
    await expect(page.getByTestId('no-person-toggle')).toBeDisabled();
    await expect(page.getByTestId('workspace-done-count')).toHaveText('1 of 9 done');

    // T-06: Bystander only on IMG-0002.png shows "bystander only — delete this file" & stays not done
    await page.getByTestId('workspace-asset-item-IMG-0002.png').click();
    await page.getByTestId('bystander-increment-btn').click();
    await expect(page.getByTestId('bystander-count-value')).toHaveText('1');
    await expect(page.getByTestId('bystander-only-warning')).toContainText(
      'bystander only — delete this file'
    );
    await expect(page.getByTestId('workspace-asset-status-IMG-0002.png')).toHaveText(
      'bystander only — delete this file'
    );
    await expect(page.getByTestId('no-person-toggle')).toBeDisabled();
    await expect(page.getByTestId('workspace-done-count')).toHaveText('1 of 9 done');

    // T-06: Set "No person" on IMG-0004.png -> done count becomes 2 of 9
    await page.getByTestId('workspace-asset-item-IMG-0004.png').click();
    await page.getByTestId('no-person-toggle').click();
    await expect(page.getByTestId('no-person-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('bystander-increment-btn')).toBeDisabled();
    await expect(page.getByTestId('workspace-done-count')).toHaveText('2 of 9 done');

    // T-06: Filter by state & type
    await page.getByTestId('asset-status-filter').selectOption('bystander_only');
    await expect(page.getByTestId('workspace-asset-item-IMG-0002.png')).toBeVisible();
    await expect(page.getByTestId('workspace-asset-item-IMG-0001.png')).toHaveCount(0);

    await page.getByTestId('asset-status-filter').selectOption('all');
    await page.getByTestId('asset-type-filter').selectOption('sensor');
    await expect(page.getByTestId('workspace-asset-item-SNS-0007.csv')).toBeVisible();
    await expect(page.getByTestId('workspace-asset-item-IMG-0002.png')).toHaveCount(0);
  });

  test('T-15, T-02 & Sample Demo: All viewers, real video/audio playback to end, fallbacks, zero network & zero-PII progress save', async ({
    page,
  }) => {
    const postLoadRequests: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.protocol !== 'blob:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
        postLoadRequests.push(req.url());
      }
    });

    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));

    // Non-MP4 bytes under an .mp4 extension triggers Chromium decode error -> FallbackViewer
    const corruptMp4Bytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]);
    const fixtures = loadSampleFixtures([
      {
        name: 'unplayable.mkv',
        path: 'unplayable.mkv',
        base64: Buffer.from('matroska-sample-bytes').toString('base64'),
        lastModified: Date.UTC(2026, 10, 4, 6, 5, 0),
      },
      {
        name: 'raw_shot.heic',
        path: 'raw_shot.heic',
        base64: Buffer.from('heic-sample-bytes').toString('base64'),
        lastModified: Date.UTC(2026, 10, 4, 6, 6, 0),
      },
      {
        name: 'corrupt_disguised.mp4',
        path: 'corrupt_disguised.mp4',
        base64: corruptMp4Bytes.toString('base64'),
        lastModified: Date.UTC(2026, 10, 4, 6, 7, 0),
      },
    ]);

    await installWritableMockDirectory(page, fixtures);
    await openWorkspace(page);

    // Total assets = 8 sample + 3 fixture fallbacks = 11
    await expect(page.getByTestId('workspace-done-count')).toHaveText('0 of 11 done');

    // 1. Tag IMG-0001.png (Persons 001 + 002) and verify real PNG render + zoom
    await page.getByTestId('workspace-asset-item-IMG-0001.png').click();
    const imgEl = page.getByTestId('image-viewer-img');
    await expect(imgEl).toBeVisible();
    await expect.poll(async () => imgEl.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);

    await page.getByTestId('image-zoom-in-btn').click();
    await expect(page.getByTestId('image-zoom-level')).toHaveText('125%');
    await page.getByTestId('image-zoom-reset-btn').click();
    await expect(page.getByTestId('image-zoom-level')).toHaveText('100%');

    await page.getByTestId(`select-person-btn-${PERSON_001}`).click();
    await page.getByTestId(`select-person-btn-${PERSON_002}`).click();
    await expect(page.getByTestId('workspace-asset-status-IMG-0001.png')).toHaveText('tagged (2)');

    // 2. Tag IMG-0002.png (Person 001 + 1 bystander) per asset_export.sample.csv
    await page.getByTestId('workspace-asset-item-IMG-0002.png').click();
    await page.getByTestId(`select-person-btn-${PERSON_001}`).click();
    await page.getByTestId('bystander-increment-btn').click();
    await expect(page.getByTestId('workspace-asset-status-IMG-0002.png')).toHaveText('tagged (1)');
    await expect(page.getByTestId('workspace-asset-bystander-IMG-0002.png')).toHaveText('bystander (1)');

    // 3. Tag IMG-0003.png (Person 002)
    await page.getByTestId('workspace-asset-item-IMG-0003.png').click();
    await page.getByTestId(`select-person-btn-${PERSON_002}`).click();
    await expect(page.getByTestId('workspace-asset-status-IMG-0003.png')).toHaveText('tagged (1)');

    // 4. Tag IMG-0004.png (No person)
    await page.getByTestId('workspace-asset-item-IMG-0004.png').click();
    await page.getByTestId('no-person-toggle').click();
    await expect(page.getByTestId('workspace-asset-status-IMG-0004.png')).toHaveText('no person');

    // 5. T-15: VID-0005.mp4 — verify video decodes, stays not done until played to end at 2x speed
    await page.getByTestId('workspace-asset-item-VID-0005.mp4').click();
    await expect(page.getByTestId('video-viewer')).toBeVisible();
    await expect(page.getByTestId('viewer-capture-source')).toHaveText('MP4 header');
    await expect(page.getByTestId('viewer-captured-at')).toContainText('06:40:00Z');

    const videoEl = page.getByTestId('video-player-element');
    await expect
      .poll(async () => videoEl.evaluate((v: HTMLVideoElement) => v.videoWidth))
      .toBeGreaterThan(0);

    // Tag Person 002 BEFORE playing -> asset shows 'not fully reviewed'
    await page.getByTestId(`select-person-btn-${PERSON_002}`).click();
    await expect(page.getByTestId('workspace-asset-status-VID-0005.mp4')).toHaveText(
      'not fully reviewed'
    );
    await expect(page.getByTestId('workspace-done-count')).toHaveText('4 of 11 done');

    // Frame step + speed 2x + play via button to end (~2s real time for 4s video)
    await page.getByTestId('video-frame-forward-btn').click();
    await page.getByTestId('video-speed-2').click();
    await page.getByTestId('video-play-pause-btn').click();

    await expect(page.getByTestId('media-review-status-badge')).toHaveText('Reviewed to end', {
      timeout: 12000,
    });
    await expect(page.getByTestId('workspace-asset-status-VID-0005.mp4')).toHaveText('tagged (1)');
    await expect(page.getByTestId('workspace-done-count')).toHaveText('5 of 11 done');

    // 6. T-15: AUD-0006.wav — heading reads 'heard in this recording', waveform renders, plays to end
    await page.getByTestId('workspace-asset-item-AUD-0006.wav').click();
    await expect(page.getByTestId('audio-viewer')).toBeVisible();
    await expect(page.getByTestId('people-panel-heading')).toContainText(/heard in this recording/i);
    await expect(page.getByTestId('audio-waveform-canvas')).toBeVisible();

    await page.getByTestId(`select-person-btn-${PERSON_001}`).click();
    await page.getByTestId(`select-person-btn-${PERSON_002}`).click();
    await expect(page.getByTestId('workspace-asset-status-AUD-0006.wav')).toHaveText(
      'not fully reviewed'
    );

    await page.getByTestId('audio-speed-2').click();
    await page.getByTestId('audio-play-pause-btn').click();
    await expect(page.getByTestId('media-review-status-badge')).toHaveText('Reviewed to end', {
      timeout: 12000,
    });
    await expect(page.getByTestId('workspace-asset-status-AUD-0006.wav')).toHaveText('tagged (2)');
    await expect(page.getByTestId('workspace-done-count')).toHaveText('6 of 11 done');

    // 7. T-15: SNS-0007.csv — shows first 200 of 202 lines & tagged Person 001
    await page.getByTestId('workspace-asset-item-SNS-0007.csv').click();
    await expect(page.getByTestId('sensor-viewer')).toBeVisible();
    await expect(page.getByTestId('sensor-line-count')).toHaveText('Showing first 200 of 202 lines');
    await expect(page.getByTestId('sensor-viewer')).toContainText('# SYNTHETIC SAMPLE SNS-0007');
    await page.getByTestId(`select-person-btn-${PERSON_001}`).click();
    await expect(page.getByTestId('workspace-done-count')).toHaveText('7 of 11 done');

    // 8. T-15: DOC-0008.pdf — mounts PDF viewer iframe with blob: src & tagged No person
    await page.getByTestId('workspace-asset-item-DOC-0008.pdf').click();
    await expect(page.getByTestId('document-viewer')).toBeVisible();
    const pdfSrc = await page.getByTestId('pdf-viewer-frame').getAttribute('src');
    expect(pdfSrc).toMatch(/^blob:/);
    await page.getByTestId('no-person-toggle').click();
    await expect(page.getByTestId('workspace-done-count')).toHaveText('8 of 11 done');

    // 9. T-15: HEIC fallback — shows fallback viewer and can still be tagged directly
    await page.getByTestId('workspace-asset-item-raw_shot.heic').click();
    await expect(page.getByTestId('fallback-viewer')).toBeVisible();
    await expect(page.getByTestId('fallback-guidance-text')).toContainText(
      'view this file in your usual viewer, then tag it here'
    );
    await page.getByTestId(`select-person-btn-${PERSON_001}`).click();
    await expect(page.getByTestId('workspace-done-count')).toHaveText('9 of 11 done');

    // 10. T-15: MKV fallback — shows fallback + requires "I reviewed it outside the app"
    await page.getByTestId('workspace-asset-item-unplayable.mkv').click();
    await expect(page.getByTestId('fallback-viewer')).toBeVisible();
    await page.getByTestId('no-person-toggle').click();
    await expect(page.getByTestId('workspace-asset-status-unplayable.mkv')).toHaveText(
      'not fully reviewed'
    );
    await page.getByTestId('confirm-external-review-btn').click();
    await expect(page.getByTestId('workspace-done-count')).toHaveText('10 of 11 done');

    // 11. Corrupt/disguised .mp4 automatically falls back on video decode error -> external confirm works
    await page.getByTestId('workspace-asset-item-corrupt_disguised.mp4').click();
    await expect(page.getByTestId('fallback-viewer')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('no-person-toggle').click();
    await page.getByTestId('confirm-external-review-btn').click();
    await expect(page.getByTestId('workspace-done-count')).toHaveText('11 of 11 done');

    // Wait for debounced 1s .dct-progress.json write & inspect written file contents (Rule 8 / R-22)
    await expect(page.getByTestId('progress-save-status')).toContainText(
      'Progress saved (.dct-progress.json)',
      { timeout: 5000 }
    );

    const progressJsonText = await page.evaluate(
      () => window.__dctWrittenFiles?.['.dct-progress.json'] ?? ''
    );
    expect(progressJsonText.length).toBeGreaterThan(0);

    // Privacy invariant: Zero participant names or contact hints in progress file or browser storage
    for (const secret of [
      'Synthetic Person 001',
      'Synthetic Person 002',
      'Synthetic Person 003',
      'Synthetic Person 004',
      '…01',
      '…02',
      '…03',
      '…04',
    ]) {
      expect(progressJsonText).not.toContain(secret);
    }

    const parsedProgress = JSON.parse(progressJsonText);
    expect(parsedProgress.format).toBe('dct.progress');
    expect(parsedProgress.format_version).toBe(1);
    expect(parsedProgress.assets['VID-0005.mp4'].reviewed_to_end).toBe(true);
    expect(parsedProgress.assets['VID-0005.mp4'].captured_at_source).toBe('media_header');
    expect(parsedProgress.assets['AUD-0006.wav'].reviewed_to_end).toBe(true);
    expect(parsedProgress.assets['IMG-0002.png'].bystander_count).toBe(1);
    expect(parsedProgress.assets['unplayable.mkv'].external_review_confirmed).toBe(true);

    // T-02: Zero external network requests occurred during the entire session
    expect(postLoadRequests).toEqual([]);

    // Zero PII in logs or URL
    for (const log of consoleLogs) {
      expect(log).not.toContain('Synthetic Person');
    }
    expect(page.url()).not.toContain('Synthetic');

    // Verify Back to Start preserves Increment 1 view and re-entering workspace preserves tags
    await page.getByTestId('back-to-start-btn').click();
    await expect(page.getByTestId('start-screen')).toBeVisible();
    await page.getByTestId('proceed-button').click();
    await expect(page.getByTestId('workspace-done-count')).toHaveText('11 of 11 done');
  });

  test('R-17 & §2.5 Layout: Thumbnails, 1280x720 pane resizing, and keyboard Space/arrows/zoom/shortcuts', async ({
    page,
  }) => {
    const fixtures = loadSampleFixtures();
    await installWritableMockDirectory(page, fixtures);
    await openWorkspace(page);

    // 1. Verify all 3 panes visible within 1280x720 with no horizontal overflow
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasOverflow).toBe(false);
    await expect(page.getByTestId('asset-list-pane')).toBeVisible();
    await expect(page.getByTestId('center-viewer-pane')).toBeVisible();
    await expect(page.getByTestId('people-panel')).toBeVisible();

    // 2. Verify thumbnails render for image and video (first frame)
    await expect(page.getByTestId('asset-thumb-img-IMG-0001.png')).toBeVisible();
    const videoThumb = page.getByTestId('asset-thumb-video-VID-0005.mp4');
    await expect(videoThumb).toBeVisible();
    await expect
      .poll(async () => videoThumb.evaluate((v: HTMLVideoElement) => v.readyState))
      .toBeGreaterThanOrEqual(2);

    // 3. Verify pane resizing via left separator drag
    const leftPane = page.getByTestId('asset-list-pane');
    const beforeBox = await leftPane.boundingBox();
    expect(beforeBox).not.toBeNull();
    const leftResizer = page.getByRole('separator', { name: 'Resize asset list pane' });
    const resizerBox = await leftResizer.boundingBox();
    expect(resizerBox).not.toBeNull();

    await page.mouse.move(
      resizerBox!.x + resizerBox!.width / 2,
      resizerBox!.y + resizerBox!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      resizerBox!.x + resizerBox!.width / 2 + 40,
      resizerBox!.y + resizerBox!.height / 2
    );
    await page.mouse.up();

    const afterBox = await leftPane.boundingBox();
    expect(afterBox!.width).toBeGreaterThan(beforeBox!.width + 20);

    // 4. Keyboard shortcuts across assets
    await page.getByTestId('workspace-asset-item-IMG-0001.png').click();
    await page.keyboard.press('+');
    await expect(page.getByTestId('image-zoom-level')).toHaveText('125%');
    await page.keyboard.press('0');
    await expect(page.getByTestId('image-zoom-level')).toHaveText('100%');

    // Navigate forward via ArrowRight -> IMG-0002.png, increment bystander with 'b'
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('viewer-asset-id')).toHaveText('IMG-0002.png');
    await page.keyboard.press('b');
    await expect(page.getByTestId('bystander-count-value')).toHaveText('1');

    // Navigate to IMG-0004.png and toggle No person via 'n'
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('viewer-asset-id')).toHaveText('IMG-0004.png');
    await page.keyboard.press('n');
    await expect(page.getByTestId('no-person-toggle')).toHaveAttribute('aria-pressed', 'true');

    // Focus search via '/', type '…01', select first match with Enter on VID-0005.mp4, press Space to play/pause
    await page.getByTestId('workspace-asset-item-VID-0005.mp4').click();
    // Space right after clicking button must toggle video play/pause, NOT re-click the button!
    await page.keyboard.press('Space');
    await expect(page.getByTestId('video-play-pause-btn')).toHaveText('Pause');
    await page.keyboard.press('Space');
    await expect(page.getByTestId('video-play-pause-btn')).toHaveText('Play');

    await page.keyboard.press('/');
    await expect(page.getByTestId('participant-search-input')).toBeFocused();
    await page.keyboard.type('…01');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(`selected-person-chip-${PERSON_001}`)).toBeVisible();
  });
});
