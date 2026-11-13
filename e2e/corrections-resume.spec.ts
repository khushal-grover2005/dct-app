import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ID = '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01';
const WRONG_PROJECT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PERSON_001 = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';
const PERSON_002 = '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2';

interface MockFixtureFile {
  name: string;
  base64: string;
  lastModified: number;
}

declare global {
  interface Window {
    __dctMutableFiles?: Record<string, MockFixtureFile>;
    __dctDeletedFiles?: string[];
  }
}

const SAMPLE_MTIME_MS = Date.parse('2026-11-04T06:20:00Z');
const REDACTED_MTIME_MS = Date.parse('2026-11-05T08:00:00Z');

function loadSampleFixtures(): MockFixtureFile[] {
  const sampleDir = path.resolve(__dirname, '../docs/consent-tagging/examples/sample-collection');
  return fs
    .readdirSync(sampleDir)
    .sort()
    .map((name) => {
      const fullPath = path.join(sampleDir, name);
      return {
        name,
        base64: fs.readFileSync(fullPath).toString('base64'),
        lastModified: SAMPLE_MTIME_MS,
      };
    });
}

function loadRedactedImg2Fixture(): MockFixtureFile {
  const redactedPath = path.resolve(
    __dirname,
    '../docs/consent-tagging/examples/sample-collection-redacted/IMG-0002.png'
  );
  return {
    name: 'IMG-0002.png',
    base64: fs.readFileSync(redactedPath).toString('base64'),
    lastModified: REDACTED_MTIME_MS,
  };
}

async function installMutableMockDirectory(page: Page, fixtures: MockFixtureFile[]) {
  await page.addInitScript((initialFixtures: MockFixtureFile[]) => {
    const filesMap: Record<string, MockFixtureFile> = {};
    for (const item of initialFixtures) {
      filesMap[item.name] = item;
    }
    const deletedNames: string[] = [];
    window.__dctMutableFiles = filesMap;
    window.__dctDeletedFiles = deletedNames;

    const toBytes = (base64: string): Uint8Array => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    };

    const bytesToBase64 = (bytes: Uint8Array): string => {
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!);
      }
      return btoa(binary);
    };

    const toFile = (entry: MockFixtureFile): File => {
      const bytes = toBytes(entry.base64);
      return new File([bytes.buffer as ArrayBuffer], entry.name, {
        lastModified: entry.lastModified,
      });
    };

    const createFileHandle = (name: string) => ({
      kind: 'file' as const,
      name,
      getFile: async () => {
        const current = filesMap[name];
        if (!current) {
          throw new DOMException(`File not found: ${name}`, 'NotFoundError');
        }
        return toFile(current);
      },
      createWritable: async () => {
        const chunks: Uint8Array[] = [];
        const encoder = new TextEncoder();
        return {
          write: async (data: string | Blob | ArrayBuffer | ArrayBufferView) => {
            if (typeof data === 'string') {
              chunks.push(encoder.encode(data));
            } else if (data instanceof Blob) {
              chunks.push(new Uint8Array(await data.arrayBuffer()));
            } else if (data instanceof ArrayBuffer) {
              chunks.push(new Uint8Array(data));
            } else if (ArrayBuffer.isView(data)) {
              chunks.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
            }
          },
          close: async () => {
            const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
            const merged = new Uint8Array(totalLen);
            let offset = 0;
            for (const c of chunks) {
              merged.set(c, offset);
              offset += c.length;
            }
            filesMap[name] = {
              name,
              base64: bytesToBase64(merged),
              lastModified: Date.now(),
            };
          },
          abort: async () => {
            // no-op
          },
        };
      },
    });

    const directoryHandle = {
      kind: 'directory' as const,
      name: 'sample-collection',
      async *entries() {
        for (const name of Object.keys(filesMap).sort()) {
          yield [name, createFileHandle(name)] as const;
        }
      },
      async *values() {
        for await (const [, handle] of directoryHandle.entries()) {
          yield handle;
        }
      },
      async getFileHandle(name: string, options?: { create?: boolean }) {
        if (options?.create) {
          if (!filesMap[name]) {
            filesMap[name] = { name, base64: '', lastModified: Date.now() };
          }
          return createFileHandle(name);
        }
        if (!filesMap[name]) {
          throw new DOMException(`File not found: ${name}`, 'NotFoundError');
        }
        return createFileHandle(name);
      },
      async removeEntry(name: string) {
        if (!filesMap[name]) {
          throw new DOMException(`File not found: ${name}`, 'NotFoundError');
        }
        delete filesMap[name];
        deletedNames.push(name);
      },
    };

    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
      async () => directoryHandle;
  }, fixtures);
}

async function openAndLoadList(page: Page, refName = 'LAB-A-2026-11-04-01') {
  const listPath = path.resolve(
    __dirname,
    '../docs/consent-tagging/examples/consented_list.sample.csv'
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
  await page.goto('/');
  await page.getByTestId('open-folder-button').click();
  await expect(page.getByTestId('folder-name')).toContainText('sample-collection');
  await page.getByTestId('collection-ref-input').fill(refName);
  await page.setInputFiles('[data-testid="consented-list-input"]', {
    name: 'consented_list.sample.csv',
    mimeType: 'text/csv',
    buffer: fs.readFileSync(listPath),
  });
}

function validateWithPython(csvText: string, expectedSummary: string): Record<string, string>[] {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dct-inc4-e2e-'));
  try {
    const listPath = path.resolve(
      __dirname,
      '../docs/consent-tagging/examples/consented_list.sample.csv'
    );
    const exportPath = path.join(tempDir, 'correction.csv');
    fs.writeFileSync(exportPath, csvText, 'utf8');
    const output = execFileSync(
      'python',
      [
        path.resolve(__dirname, '../tools/validate_export.py'),
        '--list',
        listPath,
        '--export',
        exportPath,
        '--now',
        '2026-11-05T12:00:00Z',
      ],
      { encoding: 'utf8' }
    );
    expect(output).toContain(expectedSummary);
    return Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
    }).data;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test.describe('Increment 4: Resume, Corrections, Deletions & Reminders (T-10, T-11, T-12, T-14)', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'FSA API is not supported in Firefox');

  test('T-10: resume restores tagged assets after reload, excludes PII, refuses wrong project list, flags missing/untagged files', async ({
    page,
    context,
  }) => {
    const fixtures = loadSampleFixtures();
    await installMutableMockDirectory(page, fixtures);
    await openAndLoadList(page);
    await page.getByTestId('proceed-button').click();
    await expect(page.getByTestId('tagging-workspace')).toBeVisible();
    await expect(page.getByTestId('workspace-hashing-status')).toContainText('All 8 hashes verified');

    // Tag two assets
    await page.getByTestId('workspace-asset-item-IMG-0001.png').click();
    await page.getByTestId(`select-person-btn-${PERSON_001}`).click();

    await page.getByTestId('workspace-asset-item-IMG-0004.png').click();
    await page.getByTestId('no-person-toggle').click();

    // Flush progress via Review transition or auto-save wait
    await expect(page.getByTestId('progress-save-status')).toContainText('Progress saved', {
      timeout: 5000,
    });

    const progressEntry = await page.evaluate(() => window.__dctMutableFiles?.['.dct-progress.json']);
    expect(progressEntry).toBeTruthy();
    const progressText = Buffer.from(progressEntry!.base64, 'base64').toString('utf8');
    // Rule 8: progress file must contain zero display names or contact hints
    expect(progressText).not.toContain('Synthetic Person');
    expect(progressText).not.toContain('…01');

    // Simulate reload in a fresh page (clean React & JS memory) where IMG-0004 was deleted and IMG-0009 added
    const reloadedFixtures = fixtures
      .filter((f) => f.name !== 'IMG-0004.png')
      .concat([
        {
          name: 'IMG-0009.png',
          base64: Buffer.from('new-untagged-synthetic-image').toString('base64'),
          lastModified: SAMPLE_MTIME_MS,
        },
        progressEntry!,
      ]);

    const page2 = await context.newPage();
    await installMutableMockDirectory(page2, reloadedFixtures);
    await page2.setViewportSize({ width: 1280, height: 720 });
    await page2.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
    await page2.goto('/');
    await page2.getByTestId('open-folder-button').click();

    await expect(page2.getByTestId('resume-banner')).toBeVisible();
    await expect(page2.getByTestId('resume-missing-list')).toContainText('IMG-0004.png');
    await expect(page2.getByTestId('resume-untagged-list')).toContainText('IMG-0009.png');

    // R-09: Loading a consented list from a different project_id must be refused
    const wrongListCsv = [
      'project_id,project_name,person_id,consent_id,display_name,contact_hint,consent_expires_at,is_minor,list_generated_at,list_valid_until',
      `${WRONG_PROJECT_ID},Other Study,${PERSON_001},9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,Synthetic Person 001,…01,,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z`,
    ].join('\n');
    await page2.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'wrong_list.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(wrongListCsv, 'utf8'),
    });
    await expect(page2.getByTestId('list-error-banner')).toContainText('RESUME_MISMATCH');
    await expect(page2.getByTestId('proceed-button')).toBeDisabled();

    // Load matching list and proceed
    const listPath = path.resolve(
      __dirname,
      '../docs/consent-tagging/examples/consented_list.sample.csv'
    );
    await page2.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'consented_list.sample.csv',
      mimeType: 'text/csv',
      buffer: fs.readFileSync(listPath),
    });
    await expect(page2.getByTestId('proceed-button')).toBeEnabled();
    await expect(page2.getByTestId('proceed-button')).toContainText('Resume collection');
    await page2.getByTestId('proceed-button').click();

    await expect(page2.getByTestId('tagging-workspace')).toBeVisible();
    // IMG-0001 kept its tag
    await expect(page2.getByTestId('workspace-asset-item-IMG-0001.png')).toContainText('tagged');
    // IMG-0004 missing, IMG-0009 untagged
    await expect(page2.getByTestId('workspace-asset-item-IMG-0004.png')).toContainText('missing');
    await expect(page2.getByTestId('workspace-asset-item-IMG-0009.png')).toContainText('untagged');
    await page2.close();
  });

  test('T-11: unredacted copy refused, redacted IMG-0002 clears bystander keeping person, exports valid 1-row correction sheet, workspace controls stay locked while held', async ({
    page,
  }) => {
    await installMutableMockDirectory(page, loadSampleFixtures());
    await openAndLoadList(page);
    await page.getByTestId('proceed-button').click();
    await expect(page.getByTestId('tagging-workspace')).toBeVisible();
    await expect(page.getByTestId('workspace-hashing-status')).toContainText('All 8 hashes verified');

    // Tag all 8 assets (IMG-0002 has Person 001 + 1 bystander)
    await page.getByTestId('workspace-asset-item-IMG-0001.png').click();
    await page.getByTestId(`select-person-btn-${PERSON_001}`).click();
    await page.getByTestId(`select-person-btn-${PERSON_002}`).click();

    await page.getByTestId('workspace-asset-item-IMG-0002.png').click();
    await page.getByTestId(`select-person-btn-${PERSON_001}`).click();
    await page.getByTestId('bystander-increment-btn').click();

    await page.getByTestId('workspace-asset-item-IMG-0003.png').click();
    await page.getByTestId(`select-person-btn-${PERSON_002}`).click();

    await page.getByTestId('workspace-asset-item-IMG-0004.png').click();
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
    await page.getByTestId(`select-person-btn-${PERSON_002}`).click();
    await page.getByTestId('audio-speed-2').click();
    await page.getByTestId('audio-play-pause-btn').click();
    await expect(page.getByTestId('media-review-status-badge')).toHaveText('Reviewed to end', {
      timeout: 12000,
    });

    await page.getByTestId('workspace-asset-item-SNS-0007.csv').click();
    await page.getByTestId(`select-person-btn-${PERSON_001}`).click();

    await page.getByTestId('workspace-asset-item-DOC-0008.pdf').click();
    await page.getByTestId('no-person-toggle').click();

    await page.getByTestId('go-to-review-btn').click();
    await expect(page.getByTestId('save-sheet-btn')).toBeEnabled();
    await page.getByTestId('save-sheet-btn').click();
    await expect(page.getByTestId('saved-file-name')).toBeVisible();

    // R-34: Back in workspace, bystander decrement control cannot drop held asset below 1
    await page.getByTestId('review-back-to-workspace-btn').click();
    await page.getByTestId('workspace-asset-item-IMG-0002.png').click();
    await expect(page.getByTestId('held-bystander-lock-note')).toBeVisible();
    await expect(page.getByTestId('bystander-decrement-btn')).toBeDisabled();

    // Navigate to Corrections & Deletions
    await page.getByTestId('workspace-go-to-corrections-btn').click();
    await expect(page.getByTestId('corrections-screen')).toBeVisible();
    await expect(page.getByTestId('held-asset-card-IMG-0002.png')).toBeVisible();

    // Clicking "I redacted it" BEFORE replacing file must be refused
    await page.getByTestId('redact-held-btn').click();
    await expect(page.getByTestId('held-error-banner')).toContainText(/unchanged/i);
    await expect(page.getByTestId('correction-staged-empty')).toBeVisible();

    // Replace IMG-0002.png in mock directory with redacted version
    const redactedImg2 = loadRedactedImg2Fixture();
    await page.evaluate((nextFile) => {
      if (window.__dctMutableFiles) {
        window.__dctMutableFiles['IMG-0002.png'] = nextFile;
      }
    }, redactedImg2);

    await page.getByTestId('redact-held-btn').click();
    await expect(page.getByTestId('held-outcome-redacted')).toBeVisible();
    await expect(page.getByTestId('correction-staged-count')).toHaveText('1');
    await expect(page.getByTestId('correction-row-count')).toHaveText('1');

    // Save correction sheet and verify via Python reference validator
    await page.getByTestId('save-correction-btn').click();
    await expect(page.getByTestId('correction-save-success')).toBeVisible();

    const correctionCsv = await page.evaluate(() => {
      const files = window.__dctMutableFiles ?? {};
      const key = Object.keys(files).find((name) => name.includes('_correction_'));
      return key ? { key, base64: files[key]!.base64 } : null;
    });
    expect(correctionCsv).toBeTruthy();
    const csvText = Buffer.from(correctionCsv!.base64, 'base64').toString('utf8');
    const rows = validateWithPython(csvText, 'VALID: 1 rows, 1 assets, 0 errors, 0 warnings');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      collection_ref: 'LAB-A-2026-11-04-01',
      project_id: PROJECT_ID,
      asset_id: 'IMG-0002.png',
      row_type: 'person',
      person_id: PERSON_001,
      bystander_count: '',
    });

    // Returning to workspace shows IMG-0002.png with 0 bystanders and tagged status
    await page.getByTestId('corrections-back-to-workspace-btn').click();
    await expect(page.getByTestId('workspace-asset-item-IMG-0002.png')).toContainText('tagged');
    await expect(page.getByTestId('bystander-count-value')).toHaveText('0');
  });

  test('T-12: deletion request finds IMG-0003 vs NOPE, deletes file on confirmation with valid deleted sheet; I deleted it on held asset does the same', async ({
    page,
  }) => {
    const baseFixtures = loadSampleFixtures();
    const seededProgress = {
      format: 'dct.progress',
      format_version: 1,
      collection_ref: 'LAB-A-2026-11-04-01',
      project_id: PROJECT_ID,
      list_generated_at: '2026-11-01T04:30:00Z',
      assets: {
        'IMG-0002.png': {
          sha256: 'd7ccb67ce581735227576793a5ed283fe97658b7f3855985c954cef033cb928d',
          captured_at: '2026-11-04T06:05:40Z',
          captured_at_source: 'file_modified',
          asset_type: 'image',
          person_ids: [PERSON_001],
          bystander_count: 1,
          no_person: false,
          reviewed_to_end: false,
          external_review_confirmed: false,
          state: 'active',
        },
        'IMG-0003.png': {
          sha256: '8bf338500e6e1049641dd043cca6cdc1c8883f475992b5ccdfe61aaf1c2d2227',
          captured_at: '2026-11-04T06:20:00Z',
          captured_at_source: 'exif',
          asset_type: 'image',
          person_ids: [PERSON_002],
          bystander_count: 0,
          no_person: false,
          reviewed_to_end: false,
          external_review_confirmed: false,
          state: 'active',
        },
      },
      saves: [
        {
          export_id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
          file: 'asset_export_LAB-A-2026-11-04-01_20261104T100000Z.csv',
          saved_at: '2026-11-04T10:00:00Z',
          held: ['IMG-0002.png'],
        },
      ],
    };

    await installMutableMockDirectory(page, [
      ...baseFixtures,
      {
        name: '.dct-progress.json',
        base64: Buffer.from(JSON.stringify(seededProgress, null, 2), 'utf8').toString('base64'),
        lastModified: Date.now(),
      },
    ]);

    await openAndLoadList(page);
    await expect(page.getByTestId('go-to-corrections-btn')).toBeEnabled();
    await page.getByTestId('go-to-corrections-btn').click();
    await expect(page.getByTestId('corrections-screen')).toBeVisible();

    // Part A: Batch deletion request for IMG-0003.png and NOPE.png
    await page.getByTestId('deletion-request-textarea').fill('IMG-0003.png\nNOPE.png');
    await page.getByTestId('deletion-find-btn').click();

    await expect(page.getByTestId('deletion-found-count')).toContainText('1');
    await expect(page.getByTestId('deletion-found-list')).toContainText('IMG-0003.png');
    await expect(page.getByTestId('deletion-not-found-count')).toContainText('1');
    await expect(page.getByTestId('deletion-not-found-list')).toContainText('NOPE.png');

    await page.getByTestId('batch-delete-btn').click();
    await expect(page.getByTestId('batch-delete-confirm-box')).toBeVisible();
    await page.getByTestId('confirm-batch-delete-btn').click();
    await expect(page.getByTestId('batch-deleted-notice')).toBeVisible();

    // IMG-0003.png is permanently removed from folder
    const deletedAfterBatch = await page.evaluate(() => ({
      stillPresent: Boolean(window.__dctMutableFiles?.['IMG-0003.png']),
      deletedLog: window.__dctDeletedFiles ?? [],
    }));
    expect(deletedAfterBatch.stillPresent).toBe(false);
    expect(deletedAfterBatch.deletedLog).toContain('IMG-0003.png');

    await page.getByTestId('save-correction-btn').click();
    await expect(page.getByTestId('correction-save-success')).toBeVisible();

    const batchCsvInfo = await page.evaluate(() => {
      const files = window.__dctMutableFiles ?? {};
      const keys = Object.keys(files)
        .filter((name) => name.includes('_correction_'))
        .sort();
      const latest = keys[keys.length - 1];
      return latest ? { key: latest, base64: files[latest]!.base64 } : null;
    });
    expect(batchCsvInfo).toBeTruthy();
    const batchRows = validateWithPython(
      Buffer.from(batchCsvInfo!.base64, 'base64').toString('utf8'),
      'VALID: 1 rows, 1 assets, 0 errors, 0 warnings'
    );
    expect(batchRows).toHaveLength(1);
    expect(batchRows[0]).toMatchObject({
      asset_id: 'IMG-0003.png',
      row_type: 'deleted',
      person_id: '',
      consent_id: '',
      bystander_count: '',
      content_sha256: '8bf338500e6e1049641dd043cca6cdc1c8883f475992b5ccdfe61aaf1c2d2227',
    });

    // Part B: "I deleted it" on held IMG-0002.png removes file on confirmation & validates
    await page.getByTestId('delete-held-btn').click();
    await expect(page.getByTestId('confirm-held-delete-box')).toBeVisible();
    await page.getByTestId('confirm-held-delete-btn').click();
    await expect(page.getByTestId('held-outcome-deleted')).toBeVisible();

    const deletedHeldCheck = await page.evaluate(
      () => Boolean(window.__dctMutableFiles?.['IMG-0002.png'])
    );
    expect(deletedHeldCheck).toBe(false);

    await page.getByTestId('save-correction-btn').click();
    await expect(page.getByTestId('correction-save-success')).toBeVisible();

    const heldDeleteCsvInfo = await page.evaluate(() => {
      const files = window.__dctMutableFiles ?? {};
      const keys = Object.keys(files)
        .filter((name) => name.includes('_correction_'))
        .sort();
      const latest = keys[keys.length - 1];
      return latest ? { key: latest, base64: files[latest]!.base64 } : null;
    });
    expect(heldDeleteCsvInfo).toBeTruthy();
    expect(heldDeleteCsvInfo!.key).not.toBe(batchCsvInfo!.key);
    const heldRows = validateWithPython(
      Buffer.from(heldDeleteCsvInfo!.base64, 'base64').toString('utf8'),
      'VALID: 1 rows, 1 assets, 0 errors, 0 warnings'
    );
    expect(heldRows[0]).toMatchObject({
      asset_id: 'IMG-0002.png',
      row_type: 'deleted',
      person_id: '',
      consent_id: '',
      bystander_count: '',
      content_sha256: 'd7ccb67ce581735227576793a5ed283fe97658b7f3855985c954cef033cb928d',
    });
  });

  test('T-14 (R-37): Start screen shows 7-day consented list deletion reminder when last save is > 7 days old', async ({
    page,
  }) => {
    const staleProgress = {
      format: 'dct.progress',
      format_version: 1,
      collection_ref: 'LAB-A-2026-11-04-01',
      project_id: PROJECT_ID,
      list_generated_at: '2026-10-20T04:30:00Z',
      assets: {},
      saves: [
        {
          export_id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
          file: 'asset_export_old.csv',
          saved_at: '2026-10-27T10:00:00Z',
          held: [],
        },
      ],
    };

    await installMutableMockDirectory(page, [
      ...loadSampleFixtures(),
      {
        name: '.dct-progress.json',
        base64: Buffer.from(JSON.stringify(staleProgress, null, 2), 'utf8').toString('base64'),
        lastModified: Date.now(),
      },
    ]);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
    await page.goto('/');
    await page.getByTestId('open-folder-button').click();

    await expect(page.getByTestId('list-deletion-reminder')).toBeVisible();
    await expect(page.getByTestId('list-deletion-reminder')).toContainText('9 days since last save');
  });
});
