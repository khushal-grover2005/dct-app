import { describe, it, expect } from 'vitest';
import {
  PROGRESS_FILE_NAME,
  parseProgressJson,
  readProgressFile,
  reconcileFolderWithProgress,
  isListDeletionReminderDue,
  getFileHandleByRelativePath,
  removeAssetFromDirectory,
  assetExistsInDirectory,
  computeFileSha256,
  type ProgressDocument,
  type IngestedAsset,
} from '@/folder';

function makeIngested(
  assetId: string,
  sha256?: string,
  assetType: IngestedAsset['assetType'] = 'image'
): IngestedAsset {
  return {
    assetId,
    file: new File(['content-' + assetId], assetId),
    handle: {} as FileSystemFileHandle,
    assetType,
    sizeBytes: 100,
    sha256,
    capturedAt: '2026-11-04T06:02:11Z',
    captureTimeSource: 'exif',
  };
}

function makeProgressDoc(overrides?: Partial<ProgressDocument>): ProgressDocument {
  return {
    format: 'dct.progress',
    format_version: 1,
    collection_ref: 'LAB-A-2026-11-04-01',
    project_id: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01',
    list_generated_at: '2026-11-01T04:30:00Z',
    assets: {
      'IMG-0001.png': {
        sha256: 'a'.repeat(64),
        captured_at: '2026-11-04T06:02:11Z',
        captured_at_source: 'exif',
        asset_type: 'image',
        person_ids: ['3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1'],
        bystander_count: 0,
        no_person: false,
        reviewed_to_end: false,
        external_review_confirmed: false,
        state: 'active',
      },
      'IMG-0002.png': {
        sha256: 'b'.repeat(64),
        captured_at: '2026-11-04T06:05:40Z',
        captured_at_source: 'file_modified',
        asset_type: 'image',
        person_ids: ['3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1'],
        bystander_count: 1,
        no_person: false,
        reviewed_to_end: false,
        external_review_confirmed: false,
        state: 'active',
      },
    },
    saves: [
      {
        export_id: '4c5d6e7f-8a9b-4c0d-9e1f-2a3b4c5d6e7f',
        file: 'asset_export_LAB-A_20261104T090000Z.csv',
        saved_at: '2026-11-04T09:00:00Z',
        held: ['IMG-0002.png'],
      },
    ],
    ...overrides,
  };
}

describe('Progress File Reader & Reconciliation (UC-05, R-23, R-37)', () => {
  it('parses minimal app-design §4 schema cleanly and strips extra unknown properties', () => {
    const minimalJson = JSON.stringify({
      format: 'dct.progress',
      format_version: 1,
      collection_ref: 'LAB-A-2026-11-04-01',
      project_id: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01',
      list_generated_at: '2026-11-01T04:30:00Z',
      stray_pii_attempt: 'Should be stripped',
      assets: {
        'IMG-0001.png': {
          sha256: 'a'.repeat(64),
          captured_at: '2026-11-04T06:02:11Z',
          captured_at_source: 'exif',
          asset_type: 'image',
          person_ids: ['3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1'],
          bystander_count: 0,
          no_person: false,
          state: 'active',
        },
      },
      saves: [],
    });

    const parsed = parseProgressJson(minimalJson);
    expect(parsed.error).toBeUndefined();
    expect(parsed.document).not.toBeNull();
    expect(parsed.document?.assets['IMG-0001.png']?.reviewed_to_end).toBe(false);
    expect((parsed.document as unknown as Record<string, unknown>)['stray_pii_attempt']).toBeUndefined();
  });

  it('rejects invalid JSON and mismatched progress versions', () => {
    expect(parseProgressJson('{bad').document).toBeNull();
    expect(
      parseProgressJson(
        JSON.stringify({
          format: 'dct.progress',
          format_version: 99,
          collection_ref: 'x',
          project_id: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01',
          list_generated_at: '2026-11-01T04:30:00Z',
          assets: {},
        })
      ).document
    ).toBeNull();
  });

  it('reads .dct-progress.json from directory handle or reports found: false cleanly', async () => {
    const emptyDir = {
      async getFileHandle() {
        const err = new Error('Not found');
        err.name = 'NotFoundError';
        throw err;
      },
    } as unknown as FileSystemDirectoryHandle;

    const missing = await readProgressFile(emptyDir);
    expect(missing).toEqual({ found: false, document: null });

    const doc = makeProgressDoc();
    const validDir = {
      async getFileHandle(name: string) {
        if (name === PROGRESS_FILE_NAME) {
          return {
            async getFile() {
              return new File([JSON.stringify(doc)], PROGRESS_FILE_NAME);
            },
          };
        }
        throw new Error('NotFoundError');
      },
    } as unknown as FileSystemDirectoryHandle;

    const read = await readProgressFile(validDir);
    expect(read.found).toBe(true);
    expect(read.document?.project_id).toBe(doc.project_id);
  });

  it('reconciles missing, untagged, changed, restored, and intentionally deleted assets (R-23, T-10)', () => {
    const doc = makeProgressDoc({
      assets: {
        'IMG-0001.png': {
          sha256: 'a'.repeat(64),
          captured_at: '2026-11-04T06:02:11Z',
          captured_at_source: 'exif',
          asset_type: 'image',
          person_ids: ['3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1'],
          bystander_count: 0,
          no_person: false,
          reviewed_to_end: false,
          external_review_confirmed: false,
          state: 'active',
        },
        'IMG-0002.png': {
          sha256: 'b'.repeat(64),
          captured_at: '2026-11-04T06:05:40Z',
          captured_at_source: 'file_modified',
          asset_type: 'image',
          person_ids: ['3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1'],
          bystander_count: 1,
          no_person: false,
          reviewed_to_end: false,
          external_review_confirmed: false,
          state: 'active',
        },
        'IMG-0003.png': {
          sha256: 'c'.repeat(64),
          captured_at: '2026-11-04T06:10:00Z',
          captured_at_source: 'file_modified',
          asset_type: 'image',
          person_ids: [],
          bystander_count: 0,
          no_person: true,
          reviewed_to_end: false,
          external_review_confirmed: false,
          state: 'active',
        },
        'IMG-0004.png': {
          sha256: 'd'.repeat(64),
          captured_at: '2026-11-04T06:15:00Z',
          captured_at_source: 'file_modified',
          asset_type: 'image',
          person_ids: [],
          bystander_count: 0,
          no_person: false,
          reviewed_to_end: false,
          external_review_confirmed: false,
          state: 'deleted',
        },
      },
    });

    const diskAssets: IngestedAsset[] = [
      // IMG-0001 unchanged
      makeIngested('IMG-0001.png', 'a'.repeat(64)),
      // IMG-0002 modified (e.g. redacted copy placed on disk before reload)
      makeIngested('IMG-0002.png', 'e'.repeat(64)),
      // IMG-0003 removed from disk -> should be flagged missing!
      // IMG-0004 deleted state and removed from disk -> remains deleted!
      // NEW-0009.png added on disk -> should be flagged untagged!
      makeIngested('NEW-0009.png', 'f'.repeat(64)),
    ];

    const result = reconcileFolderWithProgress(diskAssets, doc, {
      'IMG-0001.png': 'a'.repeat(64),
      'IMG-0002.png': 'e'.repeat(64),
      'NEW-0009.png': 'f'.repeat(64),
    });

    expect(result.summary.missingIds).toEqual(['IMG-0003.png']);
    expect(result.summary.untaggedNewIds).toEqual(['NEW-0009.png']);
    expect(result.summary.changedIds).toEqual(['IMG-0002.png']);
    expect(result.summary.deletedIds).toEqual(['IMG-0004.png']);
    expect(result.summary.heldFromSaveIds).toEqual(['IMG-0002.png']);
    expect(result.summary.restoredTaggedCount).toBe(1);

    const img2 = result.items.find((i) => i.assetId === 'IMG-0002.png');
    expect(img2?.discrepancy).toBe('changed');
    expect(img2?.isHeldFromSave).toBe(true);
    expect(img2?.progressSha256).toBe('b'.repeat(64));
  });

  it('detects 7-day list deletion reminder accurately (R-37, T-14)', () => {
    const doc = makeProgressDoc();
    // Saved at 2026-11-04T09:00:00Z
    expect(isListDeletionReminderDue(doc, new Date('2026-11-07T09:00:00Z'))).toEqual({
      due: false,
      daysSinceLastSave: 3,
      lastSavedAt: '2026-11-04T09:00:00Z',
    });

    // 8 days later -> due: true
    expect(isListDeletionReminderDue(doc, new Date('2026-11-12T10:00:00Z'))).toEqual({
      due: true,
      daysSinceLastSave: 8,
      lastSavedAt: '2026-11-04T09:00:00Z',
    });
  });

  it('traverses nested relative paths via FSA helpers and hashes blobs cleanly', async () => {
    const subFiles = new Map<string, File>([['x.png', new File(['nested-bytes'], 'x.png')]]);
    const subDir = {
      kind: 'directory',
      name: 'sub',
      async getFileHandle(name: string) {
        const f = subFiles.get(name);
        if (!f) throw new Error('NotFoundError');
        return { kind: 'file', name, getFile: async () => f };
      },
      async removeEntry(name: string) {
        subFiles.delete(name);
      },
    } as unknown as FileSystemDirectoryHandle;

    const rootDir = {
      kind: 'directory',
      name: 'root',
      async getDirectoryHandle(name: string) {
        if (name === 'sub') return subDir;
        throw new Error('NotFoundError');
      },
      async getFileHandle() {
        throw new Error('NotFoundError');
      },
    } as unknown as FileSystemDirectoryHandle;

    expect(await assetExistsInDirectory(rootDir, 'sub/x.png')).toBe(true);
    const handle = await getFileHandleByRelativePath(rootDir, 'sub/x.png');
    const hash = await computeFileSha256(await handle.getFile());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    await removeAssetFromDirectory(rootDir, 'sub/x.png');
    expect(await assetExistsInDirectory(rootDir, 'sub/x.png')).toBe(false);
  });
});
