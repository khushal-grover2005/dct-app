import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCorrections, type SaveCorrectionSheetResult } from '@/corrections';
import { computeFileSha256, readFileTextSafe, type IngestedAsset, type ProgressDocument } from '@/folder';
import { loadConsentedList, type ConsentedListResult } from '@/list';
import { useTaggingWorkspace } from '@/tagging';

interface MemoryFsState {
  files: Map<string, File>;
  deletedLog: string[];
}

function createWritableMockDirectoryHandle(name = 'sample-collection'): {
  handle: FileSystemDirectoryHandle;
  fs: MemoryFsState;
} {
  const files = new Map<string, File>();
  const deletedLog: string[] = [];

  const handle = {
    kind: 'directory',
    name,
    getFileHandle: async (fileName: string, options?: { create?: boolean }) => {
      const existing = files.get(fileName);
      if (!existing && !options?.create) {
        throw new DOMException(`File not found: ${fileName}`, 'NotFoundError');
      }
      if (!existing && options?.create) {
        files.set(fileName, new File([''], fileName));
      }

      return {
        kind: 'file',
        name: fileName,
        getFile: async () => {
          const f = files.get(fileName);
          if (!f) throw new DOMException(`File not found: ${fileName}`, 'NotFoundError');
          return f;
        },
        createWritable: async () => {
          const chunks: BlobPart[] = [];
          return {
            write: async (data: string | BufferSource | Blob) => {
              chunks.push(typeof data === 'string' ? data : data);
            },
            close: async () => {
              files.set(
                fileName,
                new File(chunks, fileName, {
                  type: fileName.endsWith('.json') ? 'application/json' : 'text/csv',
                  lastModified: Date.now(),
                })
              );
            },
            abort: async () => {
              // no-op
            },
          };
        },
      } as unknown as FileSystemFileHandle;
    },
    getDirectoryHandle: async (dirName: string) => {
      throw new DOMException(`Directory not found: ${dirName}`, 'NotFoundError');
    },
    removeEntry: async (entryName: string) => {
      if (!files.has(entryName)) {
        throw new DOMException(`File not found: ${entryName}`, 'NotFoundError');
      }
      files.delete(entryName);
      deletedLog.push(entryName);
    },
  } as unknown as FileSystemDirectoryHandle;

  return { handle, fs: { files, deletedLog } };
}

const SAMPLE_LIST_CSV = [
  'project_id,project_name,person_id,consent_id,display_name,contact_hint,consent_expires_at,is_minor,list_generated_at,list_valid_until',
  '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,Synthetic gait study,3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,Synthetic Person 001,…01,,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z',
  '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,Synthetic gait study,7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2,1d90a2b3-c4d5-4e6f-8a9b-0c1d2e3f0202,Synthetic Person 002,…02,2027-05-01T00:00:00Z,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z',
].join('\n');

function getConsentedList(): ConsentedListResult {
  const res = loadConsentedList(SAMPLE_LIST_CSV, {
    referenceTime: new Date('2026-11-04T06:00:00Z'),
  });
  if (!res.success) throw new Error('Expected valid synthetic consented list');
  return res.data;
}

describe('useCorrections', () => {
  it('R-31 & R-33: refuses unchanged hash on "I redacted it", clears bystander when hash changes, and saves a 1-row correction sheet', async () => {
    const consentedList = getConsentedList();
    const { handle, fs } = createWritableMockDirectoryHandle();

    const file1 = new File(['img-1-bytes'], 'IMG-0001.png', { lastModified: 1700000000000 });
    const file2Orig = new File(['img-2-with-bystander'], 'IMG-0002.png', {
      lastModified: 1700000001000,
    });
    const sha1 = await computeFileSha256(file1);
    const sha2Orig = await computeFileSha256(file2Orig);
    fs.files.set('IMG-0001.png', file1);
    fs.files.set('IMG-0002.png', file2Orig);

    const ingested: IngestedAsset[] = [
      {
        assetId: 'IMG-0001.png',
        file: file1,
        handle: {} as FileSystemFileHandle,
        assetType: 'image',
        sizeBytes: file1.size,
        sha256: sha1,
        capturedAt: '2026-11-04T06:02:11Z',
        captureTimeSource: 'exif',
      },
      {
        assetId: 'IMG-0002.png',
        file: file2Orig,
        handle: {} as FileSystemFileHandle,
        assetType: 'image',
        sizeBytes: file2Orig.size,
        sha256: sha2Orig,
        capturedAt: '2026-11-04T06:05:40Z',
        captureTimeSource: 'last_modified',
      },
    ];

    const initialProgress: ProgressDocument = {
      format: 'dct.progress',
      format_version: 1,
      collection_ref: 'LAB-A-2026-11-04-01',
      project_id: consentedList.projectId,
      list_generated_at: consentedList.listGeneratedAt,
      assets: {
        'IMG-0001.png': {
          sha256: sha1,
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
          sha256: sha2Orig,
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
          export_id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
          file: 'asset_export_LAB-A-2026-11-04-01_20261104T100000Z.csv',
          saved_at: '2026-11-04T10:00:00Z',
          held: ['IMG-0002.png'],
        },
      ],
    };

    const assetHashes = { 'IMG-0001.png': sha1, 'IMG-0002.png': sha2Orig };

    const { result } = renderHook(() => {
      const controller = useTaggingWorkspace({
        directoryHandle: handle,
        assets: ingested,
        assetHashes,
        consentedList,
        collectionRef: 'LAB-A-2026-11-04-01',
        initialProgress,
      });
      const corrections = useCorrections({
        controller,
        directoryHandle: handle,
        consentedList,
        collectionRef: 'LAB-A-2026-11-04-01',
      });
      return { controller, corrections };
    });

    expect(result.current.corrections.heldAssets).toHaveLength(1);
    expect(result.current.corrections.heldAssets[0]?.assetId).toBe('IMG-0002.png');

    // Step 1: Unchanged file hash must be rejected
    await act(async () => {
      await result.current.corrections.redactHeldAsset('IMG-0002.png');
    });

    expect(result.current.corrections.heldAssets[0]?.outcome).toBe('pending');
    expect(result.current.corrections.heldAssets[0]?.errorMessage).toMatch(/unchanged/i);
    expect(result.current.corrections.stagedAssetIds).toEqual([]);

    // Step 2: Replace IMG-0002.png on disk with redacted copy and click "I redacted it"
    const file2Redacted = new File(['img-2-redacted-bystander-removed'], 'IMG-0002.png', {
      lastModified: 1700000100000,
    });
    const sha2Redacted = await computeFileSha256(file2Redacted);
    fs.files.set('IMG-0002.png', file2Redacted);

    await act(async () => {
      await result.current.corrections.redactHeldAsset('IMG-0002.png');
    });

    expect(result.current.corrections.heldAssets[0]?.outcome).toBe('redacted');
    expect(result.current.corrections.heldAssets[0]?.bystanderCount).toBe(0);
    expect(result.current.corrections.heldAssets[0]?.personIds).toEqual([
      '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1',
    ]);
    expect(result.current.corrections.stagedAssetIds).toEqual(['IMG-0002.png']);
    expect(result.current.corrections.preview?.valid).toBe(true);
    expect(result.current.corrections.preview?.rowCount).toBe(1);

    // Step 3: Save correction sheet -> writes CSV with ONLY IMG-0002.png and updates progress saves
    const saveRef: { current: SaveCorrectionSheetResult | null } = { current: null };
    await act(async () => {
      saveRef.current = await result.current.corrections.saveCorrectionSheet();
    });

    const saveOutcome = saveRef.current;
    expect(saveOutcome).not.toBeNull();
    expect(saveOutcome?.saved).toBe(true);
    expect(saveOutcome?.rowCount).toBe(1);
    const savedCsvFile = fs.files.get(saveOutcome!.fileName);
    expect(savedCsvFile).toBeDefined();
    const csvText = await readFileTextSafe(savedCsvFile!);
    const lines = csvText.trim().split(/\r?\n/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('IMG-0002.png');
    expect(lines[1]).toContain(sha2Redacted);
    expect(lines[1]).toContain(',person,3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1,');
    expect(lines[1]).not.toContain('IMG-0001.png');

    expect(result.current.controller.saves).toHaveLength(2);
    const progressFile = fs.files.get('.dct-progress.json');
    expect(progressFile).toBeDefined();
    const progressText = await readFileTextSafe(progressFile!);
    expect(progressText).not.toContain('Synthetic Person');
  });

  it('R-32, R-35, R-36: checks deletion requests (found vs not found), batch deletes once, and handles held "I deleted it"', async () => {
    const consentedList = getConsentedList();
    const { handle, fs } = createWritableMockDirectoryHandle();

    const file2 = new File(['held-file'], 'IMG-0002.png');
    const file3 = new File(['delete-me'], 'IMG-0003.png');
    const sha2 = await computeFileSha256(file2);
    const sha3 = await computeFileSha256(file3);
    fs.files.set('IMG-0002.png', file2);
    fs.files.set('IMG-0003.png', file3);

    const ingested: IngestedAsset[] = [
      {
        assetId: 'IMG-0002.png',
        file: file2,
        handle: {} as FileSystemFileHandle,
        assetType: 'image',
        sizeBytes: file2.size,
        sha256: sha2,
        capturedAt: '2026-11-04T06:05:40Z',
        captureTimeSource: 'last_modified',
      },
      {
        assetId: 'IMG-0003.png',
        file: file3,
        handle: {} as FileSystemFileHandle,
        assetType: 'image',
        sizeBytes: file3.size,
        sha256: sha3,
        capturedAt: '2026-11-04T06:20:00Z',
        captureTimeSource: 'exif',
      },
    ];

    const initialProgress: ProgressDocument = {
      format: 'dct.progress',
      format_version: 1,
      collection_ref: 'LAB-A-2026-11-04-01',
      project_id: consentedList.projectId,
      list_generated_at: consentedList.listGeneratedAt,
      assets: {
        'IMG-0002.png': {
          sha256: sha2,
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
          sha256: sha3,
          captured_at: '2026-11-04T06:20:00Z',
          captured_at_source: 'exif',
          asset_type: 'image',
          person_ids: ['7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2'],
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

    const assetHashes = { 'IMG-0002.png': sha2, 'IMG-0003.png': sha3 };

    const { result } = renderHook(() => {
      const controller = useTaggingWorkspace({
        directoryHandle: handle,
        assets: ingested,
        assetHashes,
        consentedList,
        collectionRef: 'LAB-A-2026-11-04-01',
        initialProgress,
      });
      const corrections = useCorrections({
        controller,
        directoryHandle: handle,
        consentedList,
        collectionRef: 'LAB-A-2026-11-04-01',
      });
      return { controller, corrections };
    });

    // R-35: Find requested deletions
    act(() => {
      result.current.corrections.setDeletionRequestText('IMG-0003.png\nNOPE.png');
    });

    await act(async () => {
      await result.current.corrections.checkDeletionRequests();
    });

    expect(result.current.corrections.deletionCheckResult).toEqual({
      requestedIds: ['IMG-0003.png', 'NOPE.png'],
      foundIds: ['IMG-0003.png'],
      notFoundIds: ['NOPE.png'],
    });

    // R-36: Single batch confirmation
    act(() => {
      result.current.corrections.requestBatchDelete();
    });
    expect(result.current.corrections.pendingBatchDeleteConfirm).toBe(true);
    expect(fs.files.has('IMG-0003.png')).toBe(true);

    await act(async () => {
      await result.current.corrections.confirmBatchDelete();
    });

    expect(fs.files.has('IMG-0003.png')).toBe(false);
    expect(fs.deletedLog).toContain('IMG-0003.png');
    expect(result.current.corrections.stagedAssetIds).toEqual(['IMG-0003.png']);
    expect(result.current.corrections.preview?.valid).toBe(true);
    expect(result.current.corrections.preview?.deletedCount).toBe(1);

    // R-32: Held asset "I deleted it" asks once while file exists, then removes and records deleted
    await act(async () => {
      await result.current.corrections.requestDeleteHeldAsset('IMG-0002.png');
    });
    expect(result.current.corrections.pendingDeleteHeldAssetId).toBe('IMG-0002.png');

    await act(async () => {
      await result.current.corrections.confirmDeleteHeldAsset('IMG-0002.png');
    });

    expect(fs.files.has('IMG-0002.png')).toBe(false);
    expect(result.current.corrections.heldAssets[0]?.outcome).toBe('deleted');
    expect(result.current.corrections.stagedAssetIds).toEqual(['IMG-0003.png', 'IMG-0002.png']);

    const saveRef: { current: SaveCorrectionSheetResult | null } = { current: null };
    await act(async () => {
      saveRef.current = await result.current.corrections.saveCorrectionSheet();
    });

    const saved = saveRef.current;
    expect(saved).not.toBeNull();
    expect(saved?.saved).toBe(true);
    expect(saved?.rowCount).toBe(2);
  });
});
