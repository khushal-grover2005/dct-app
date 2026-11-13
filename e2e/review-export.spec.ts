import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PERSON_001 = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';
const PERSON_002 = '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2';

interface MockFixtureFile {
  name: string;
  base64: string;
  lastModified: number;
}

declare global {
  interface Window {
    __dctWrittenFiles?: Record<string, string>;
  }
}

function loadSampleFixtures(): MockFixtureFile[] {
  const sampleDir = path.resolve(__dirname, '../docs/consent-tagging/examples/sample-collection');
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
  return Object.entries(captureTimes).map(([name, lastModified]) => ({
    name,
    lastModified,
    base64: fs.readFileSync(path.join(sampleDir, name)).toString('base64'),
  }));
}

async function installWritableMockDirectory(
  page: import('@playwright/test').Page,
  fixtures: MockFixtureFile[]
) {
  await page.addInitScript((files) => {
    const writtenFiles: Record<string, string> = {};
    window.__dctWrittenFiles = writtenFiles;

    function toBytes(base64: string): Uint8Array {
      const binary = atob(base64);
      return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    }

    const createFileHandle = (name: string) => ({
      kind: 'file' as const,
      name,
      async getFile() {
        return new File([writtenFiles[name] ?? ''], name);
      },
      async createWritable() {
        let content = '';
        return {
          async write(data: string) {
            content = data;
          },
          async close() {
            writtenFiles[name] = content;
          },
        };
      },
      async move(newName: string) {
        writtenFiles[newName] = writtenFiles[name] ?? '';
        delete writtenFiles[name];
      },
    });

    const directoryHandle = {
      kind: 'directory',
      name: 'sample-collection',
      async *entries() {
        for (const fixture of files) {
          const bytes = toBytes(fixture.base64);
          const file = new File([bytes.buffer as ArrayBuffer], fixture.name, {
            lastModified: fixture.lastModified,
          });
          yield [fixture.name, { kind: 'file', name: fixture.name, getFile: async () => file }];
        }
      },
      async *values() {
        for await (const [, handle] of directoryHandle.entries()) yield handle;
      },
      async getFileHandle(name: string, options?: { create?: boolean }) {
        if (options?.create || name in writtenFiles) {
          writtenFiles[name] ??= '';
          return createFileHandle(name);
        }
        const fixture = files.find((item) => item.name === name);
        if (!fixture) throw new Error('File not found.');
        const bytes = toBytes(fixture.base64);
        const file = new File([bytes.buffer as ArrayBuffer], fixture.name, {
          lastModified: fixture.lastModified,
        });
        return { kind: 'file', name, getFile: async () => file };
      },
      async removeEntry(name: string) {
        delete writtenFiles[name];
      },
    };

    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
      async () => directoryHandle;
  }, fixtures);
}

async function openWorkspace(page: import('@playwright/test').Page) {
  const listPath = path.resolve(
    __dirname,
    '../docs/consent-tagging/examples/consented_list.sample.csv'
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
  await page.goto('/');
  await page.getByTestId('open-folder-button').click();
  await expect(page.getByTestId('folder-name')).toContainText('sample-collection');
  await page.getByTestId('collection-ref-input').fill('LAB-A-2026-11-04-01');
  await page.setInputFiles('[data-testid="consented-list-input"]', {
    name: 'consented_list.sample.csv',
    mimeType: 'text/csv',
    buffer: fs.readFileSync(listPath),
  });
  await expect(page.getByTestId('proceed-button')).toBeEnabled();
  await page.getByTestId('proceed-button').click();
  await expect(page.getByTestId('tagging-workspace')).toBeVisible();
  await expect(page.getByTestId('workspace-hashing-status')).toContainText('All 8 hashes verified');
}

test.describe('Increment 3: Review and save export (T-08, T-09)', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'FSA API is not supported in Firefox');

  test('T-09: validation errors disable save and jump to the selected asset', async ({ page }) => {
    await installWritableMockDirectory(page, loadSampleFixtures());
    await openWorkspace(page);
    await page.getByTestId('workspace-asset-item-IMG-0002.png').click();
    await page.getByTestId('bystander-increment-btn').click();
    await page.getByTestId('go-to-review-btn').click();

    await expect(page.getByTestId('review-screen')).toBeVisible();
    await expect(page.getByTestId('review-errors')).toContainText('[E11]');
    await expect(page.getByTestId('save-sheet-btn')).toBeDisabled();
    await page
      .getByTestId('review-errors')
      .getByTestId('error-jump-IMG-0002.png')
      .click();
    await expect(page.getByTestId('tagging-workspace')).toBeVisible();
    await expect(page.getByTestId('viewer-asset-id')).toHaveText('IMG-0002.png');
  });

  test('T-08: saves the sample sheet, validates it, and creates a new export id on repeat save', async ({
    page,
  }) => {
    await installWritableMockDirectory(page, loadSampleFixtures());
    await openWorkspace(page);

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
    const firstExportId = await page.getByTestId('saved-export-id').textContent();
    const writtenFiles = await page.evaluate(() => window.__dctWrittenFiles ?? {});
    const exportName = Object.keys(writtenFiles).find((name) => name.startsWith('asset_export_'));
    expect(exportName).toBeTruthy();

    const expectedPath = path.resolve(
      __dirname,
      '../docs/consent-tagging/examples/asset_export.sample.csv'
    );
    const sortRows = (rows: Record<string, string>[]) =>
      rows.sort((a, b) =>
        `${a.asset_id ?? ''}|${a.row_type ?? ''}|${a.person_id ?? ''}`.localeCompare(
          `${b.asset_id ?? ''}|${b.row_type ?? ''}|${b.person_id ?? ''}`
        )
      );
    const expectedRows = sortRows(Papa.parse<Record<string, string>>(
      fs.readFileSync(expectedPath, 'utf8'),
      { header: true, skipEmptyLines: true }
    ).data.map((row) => ({ ...row, export_id: firstExportId ?? '', exported_at: '2026-11-05T12:00:00Z' })));
    const actualRows = sortRows(Papa.parse<Record<string, string>>(writtenFiles[exportName!] ?? '', {
      header: true,
      skipEmptyLines: true,
    }).data);
    expect(actualRows).toEqual(expectedRows);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dct-review-export-'));
    try {
      const listPath = path.resolve(
        __dirname,
        '../docs/consent-tagging/examples/consented_list.sample.csv'
      );
      const exportPath = path.join(tempDir, exportName!);
      fs.writeFileSync(exportPath, writtenFiles[exportName!] ?? '', 'utf8');
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
      expect(output).toContain('VALID: 11 rows, 8 assets, 0 errors, 1 warnings');
      expect(output).toContain('IMG-0002.png');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    await page.getByTestId('save-sheet-btn').click();
    await expect(page.getByTestId('saved-export-id')).not.toHaveText(firstExportId ?? '');
  });
});
