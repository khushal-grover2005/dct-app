import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PROGRESS_FILE_NAME,
  PROGRESS_TEMP_FILE_NAME,
  buildProgressDocument,
  createDebouncedProgressSaver,
  writeProgressFile,
} from '@/folder/progressWriter';

function createWritableDirectoryMock(options?: { supportMove?: boolean }) {
  const files = new Map<string, string>();
  const removed: string[] = [];

  const dirHandle = {
    kind: 'directory',
    name: 'sample-collection',
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      if (!opts?.create && !files.has(name)) {
        throw new Error(`NotFoundError: ${name}`);
      }
      if (!files.has(name)) {
        files.set(name, '');
      }
      let currentName = name;
      let pendingContent = files.get(name) ?? '';

      const handle: Record<string, unknown> = {
        kind: 'file',
        name: currentName,
        async createWritable() {
          return {
            async write(data: string) {
              pendingContent = data;
            },
            async close() {
              files.set(currentName, pendingContent);
            },
          };
        },
        async getFile() {
          return new File([files.get(currentName) ?? ''], currentName);
        },
      };

      if (options?.supportMove) {
        handle.move = async (newName: string) => {
          const content = files.get(currentName) ?? '';
          files.delete(currentName);
          currentName = newName;
          files.set(newName, content);
        };
      }

      return handle as unknown as FileSystemFileHandle;
    },
    async removeEntry(name: string) {
      files.delete(name);
      removed.push(name);
    },
  } as unknown as FileSystemDirectoryHandle;

  return { dirHandle, files, removed };
}

describe('Progress File Writer (.dct-progress.json & AGENTS.md Rule 8 Privacy)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds app-design §4 progress schema containing identifiers ONLY (zero PII)', () => {
    const doc = buildProgressDocument({
      collectionRef: 'LAB-A-2026-11-04-01',
      projectId: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01',
      listGeneratedAt: '2026-11-01T04:30:00Z',
      assets: [
        {
          assetId: 'IMG-0001.png',
          sha256: '2180908ddf0ede06fd1be557ec0741028aaccc8f69030b0260c071490fe198e3',
          capturedAt: '2026-11-04T06:02:11Z',
          captureTimeSource: 'exif',
          assetType: 'image',
          personIds: ['3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1'],
          bystanderCount: 0,
          noPerson: false,
          reviewedToEnd: false,
          externalReviewConfirmed: false,
          state: 'active',
        },
        {
          assetId: 'VID-0005.mp4',
          sha256: '06020319b521122923f0c02ecdb030893d561ce6ccf9e3e596791e68de8e002b',
          capturedAt: '2026-11-04T06:40:00Z',
          captureTimeSource: 'mp4box',
          assetType: 'video',
          personIds: [],
          bystanderCount: 0,
          noPerson: true,
          reviewedToEnd: false,
          externalReviewConfirmed: true,
          state: 'active',
        },
      ],
    });

    expect(doc.format).toBe('dct.progress');
    expect(doc.format_version).toBe(1);
    expect(doc.assets['IMG-0001.png']?.captured_at_source).toBe('exif');
    expect(doc.assets['VID-0005.mp4']?.captured_at_source).toBe('media_header');
    expect(doc.assets['VID-0005.mp4']?.external_review_confirmed).toBe(true);

    const json = JSON.stringify(doc);
    expect(json).not.toContain('Synthetic Person');
    expect(json).not.toContain('display_name');
    expect(json).not.toContain('contact_hint');
  });

  it('writes atomically using move() when available and cleans up temp file on fallback', async () => {
    const doc = buildProgressDocument({
      collectionRef: 'sample-collection',
      projectId: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01',
      listGeneratedAt: '2026-11-01T04:30:00Z',
      assets: [],
    });

    // Path 1: With move()
    const withMove = createWritableDirectoryMock({ supportMove: true });
    const res1 = await writeProgressFile(withMove.dirHandle, doc);
    expect(res1.written).toBe(true);
    expect(withMove.files.has(PROGRESS_FILE_NAME)).toBe(true);
    expect(withMove.files.has(PROGRESS_TEMP_FILE_NAME)).toBe(false);

    // Path 2: Fallback without move()
    const withoutMove = createWritableDirectoryMock({ supportMove: false });
    const res2 = await writeProgressFile(withoutMove.dirHandle, doc);
    expect(res2.written).toBe(true);
    expect(withoutMove.files.has(PROGRESS_FILE_NAME)).toBe(true);
    expect(withoutMove.removed).toContain(PROGRESS_TEMP_FILE_NAME);
  });

  it('debounces rapid tagging edits to 1 second per R-22', async () => {
    const { dirHandle, files } = createWritableDirectoryMock({ supportMove: true });
    const onResult = vi.fn();
    const saver = createDebouncedProgressSaver(1000, onResult);

    const makeDoc = (personCount: number) =>
      buildProgressDocument({
        collectionRef: 'sample',
        projectId: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01',
        listGeneratedAt: '2026-11-01T04:30:00Z',
        assets: [
          {
            assetId: 'IMG-0001.png',
            capturedAt: '2026-11-04T06:02:11Z',
            captureTimeSource: 'last_modified',
            assetType: 'image',
            personIds: Array.from({ length: personCount }, (_, i) => `p-${i}`),
            bystanderCount: 0,
            noPerson: false,
            reviewedToEnd: false,
            externalReviewConfirmed: false,
            state: 'active',
          },
        ],
      });

    saver.schedule(dirHandle, makeDoc(1));
    await vi.advanceTimersByTimeAsync(500);
    expect(files.has(PROGRESS_FILE_NAME)).toBe(false);

    // Second change resets the 1s window
    saver.schedule(dirHandle, makeDoc(2));
    await vi.advanceTimersByTimeAsync(700);
    expect(files.has(PROGRESS_FILE_NAME)).toBe(false);

    await vi.advanceTimersByTimeAsync(350);
    expect(files.has(PROGRESS_FILE_NAME)).toBe(true);
    const saved = JSON.parse(files.get(PROGRESS_FILE_NAME)!);
    expect(saved.assets['IMG-0001.png'].person_ids).toEqual(['p-0', 'p-1']);
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('serializes in-flight writes and awaits completion when flush() is called', async () => {
    vi.useRealTimers();
    const { dirHandle, files } = createWritableDirectoryMock({ supportMove: true });
    let releaseFirstWrite: () => void = () => {};
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    let getFileCalls = 0;

    const origGetFileHandle = dirHandle.getFileHandle.bind(dirHandle);
    dirHandle.getFileHandle = async (name: string, opts?: FileSystemGetFileOptions) => {
      getFileCalls++;
      if (getFileCalls === 1) {
        await firstWriteGate;
      }
      return origGetFileHandle(name, opts);
    };

    const onResult = vi.fn();
    const saver = createDebouncedProgressSaver(10, onResult);

    const makeDoc = (count: number) =>
      buildProgressDocument({
        collectionRef: 'sample',
        projectId: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01',
        listGeneratedAt: '2026-11-01T04:30:00Z',
        assets: [
          {
            assetId: 'IMG-0001.png',
            capturedAt: '2026-11-04T06:02:11Z',
            captureTimeSource: 'last_modified',
            assetType: 'image',
            personIds: Array.from({ length: count }, (_, i) => `p-${i}`),
            bystanderCount: 0,
            noPerson: false,
            reviewedToEnd: false,
            externalReviewConfirmed: false,
            state: 'active',
          },
        ],
      });

    saver.schedule(dirHandle, makeDoc(1));
    await new Promise((r) => setTimeout(r, 25)); // First write starts and pauses on firstWriteGate

    saver.schedule(dirHandle, makeDoc(2));
    const flushPromise = saver.flush();

    // Release first write so queued second write can proceed sequentially
    releaseFirstWrite();
    await flushPromise;

    const saved = JSON.parse(files.get(PROGRESS_FILE_NAME)!);
    expect(saved.assets['IMG-0001.png'].person_ids).toEqual(['p-0', 'p-1']);
    expect(onResult).toHaveBeenCalledTimes(2);
  });
});
