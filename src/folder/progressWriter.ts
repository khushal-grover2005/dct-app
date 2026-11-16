import type { AssetType, CaptureTimeSource } from './types';

export const PROGRESS_FILE_NAME = '.dct-progress.json';
export const PROGRESS_TEMP_FILE_NAME = '.dct-progress.json.tmp';

export type ProgressCaptureSource = 'exif' | 'media_header' | 'file_modified';

export interface ProgressAssetEntry {
  sha256: string | null;
  captured_at: string;
  captured_at_source: ProgressCaptureSource;
  asset_type: AssetType;
  person_ids: string[];
  bystander_count: number;
  no_person: boolean;
  reviewed_to_end: boolean;
  external_review_confirmed: boolean;
  state: 'active' | 'deleted';
}

export interface ProgressSaveEntry {
  export_id: string;
  file: string;
  saved_at: string;
  held: string[];
}

export interface ProgressDocument {
  format: 'dct.progress';
  format_version: 1;
  collection_ref: string;
  project_id: string;
  list_generated_at: string;
  assets: Record<string, ProgressAssetEntry>;
  saves: ProgressSaveEntry[];
}

export interface ProgressAssetInput {
  assetId: string;
  sha256?: string;
  capturedAt: string;
  captureTimeSource: CaptureTimeSource;
  assetType: AssetType;
  personIds: string[];
  bystanderCount: number;
  noPerson: boolean;
  reviewedToEnd: boolean;
  externalReviewConfirmed: boolean;
  state: 'active' | 'deleted';
}

export interface BuildProgressInput {
  collectionRef: string;
  projectId: string;
  listGeneratedAt: string;
  assets: ProgressAssetInput[];
  saves?: ProgressSaveEntry[];
}

interface FileSystemFileHandleWithMove extends FileSystemFileHandle {
  move?: (newName: string) => Promise<void>;
}

export function toProgressCaptureSource(source: CaptureTimeSource): ProgressCaptureSource {
  switch (source) {
    case 'exif':
      return 'exif';
    case 'mp4box':
      return 'media_header';
    case 'last_modified':
      return 'file_modified';
  }
}

/**
 * Builds the in-folder `.dct-progress.json` document containing identifiers ONLY.
 * Structural privacy invariant (AGENTS.md Rule 8): participant display names and
 * contact hints are never accepted or written here.
 */
export function buildProgressDocument(input: BuildProgressInput): ProgressDocument {
  const assetsRecord: Record<string, ProgressAssetEntry> = {};

  for (const asset of input.assets) {
    assetsRecord[asset.assetId] = {
      sha256: asset.sha256 ?? null,
      captured_at: asset.capturedAt,
      captured_at_source: toProgressCaptureSource(asset.captureTimeSource),
      asset_type: asset.assetType,
      person_ids: [...asset.personIds],
      bystander_count: asset.bystanderCount,
      no_person: asset.noPerson,
      reviewed_to_end: asset.reviewedToEnd,
      external_review_confirmed: asset.externalReviewConfirmed,
      state: asset.state,
    };
  }

  return {
    format: 'dct.progress',
    format_version: 1,
    collection_ref: input.collectionRef,
    project_id: input.projectId,
    list_generated_at: input.listGeneratedAt,
    assets: assetsRecord,
    saves: input.saves ? [...input.saves] : [],
  };
}

export interface WriteProgressResult {
  written: boolean;
  error?: string;
}

/**
 * Writes the progress file atomically (write temp file then rename/replace target).
 */
export async function writeProgressFile(
  directoryHandle: FileSystemDirectoryHandle,
  document: ProgressDocument
): Promise<WriteProgressResult> {
  if (typeof directoryHandle.getFileHandle !== 'function') {
    return { written: false, error: 'Directory handle does not support getFileHandle' };
  }

  const serialized = JSON.stringify(document, null, 2);

  let movedToTarget = false;
  let tmpCreated = false;

  try {
    // 1. Write to temporary file first
    const tmpHandle = (await directoryHandle.getFileHandle(PROGRESS_TEMP_FILE_NAME, {
      create: true,
    })) as FileSystemFileHandleWithMove;
    tmpCreated = true;

    if (typeof tmpHandle.createWritable !== 'function') {
      return { written: false, error: 'File handle does not support createWritable' };
    }

    const tmpWritable = await tmpHandle.createWritable();
    await tmpWritable.write(serialized);
    await tmpWritable.close();

    // 2. Rename atomically if move() is supported by browser/handle
    if (typeof tmpHandle.move === 'function') {
      try {
        await tmpHandle.move(PROGRESS_FILE_NAME);
        movedToTarget = true;
        return { written: true };
      } catch {
        // Fallback below if handle.move() fails on local FSA mount
      }
    }

    // 3. Fallback: write final target file directly and clean up temp file
    const targetHandle = await directoryHandle.getFileHandle(PROGRESS_FILE_NAME, {
      create: true,
    });
    const targetWritable = await targetHandle.createWritable();
    await targetWritable.write(serialized);
    await targetWritable.close();

    return { written: true };
  } catch (err) {
    return {
      written: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (tmpCreated && !movedToTarget && typeof directoryHandle.removeEntry === 'function') {
      try {
        await directoryHandle.removeEntry(PROGRESS_TEMP_FILE_NAME);
      } catch {
        // Ignore cleanup failures
      }
    }
  }
}

export interface DebouncedProgressSaver {
  schedule: (directoryHandle: FileSystemDirectoryHandle, document: ProgressDocument) => void;
  flush: () => Promise<WriteProgressResult | null>;
  cancel: () => void;
}

export function createDebouncedProgressSaver(
  delayMs: number = 1000,
  onResult?: (result: WriteProgressResult) => void
): DebouncedProgressSaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { handle: FileSystemDirectoryHandle; doc: ProgressDocument } | null = null;
  let activeWrite: Promise<WriteProgressResult | null> | null = null;

  const executeWrite = (): Promise<WriteProgressResult | null> => {
    const prevWrite = activeWrite;
    const run = async (): Promise<WriteProgressResult | null> => {
      if (prevWrite) {
        await prevWrite;
      }
      if (!pending) {
        return null;
      }
      const { handle, doc } = pending;
      pending = null;
      const result = await writeProgressFile(handle, doc);
      onResult?.(result);
      return result;
    };

    const current = run().finally(() => {
      if (activeWrite === current) {
        activeWrite = null;
      }
    });
    activeWrite = current;
    return current;
  };

  return {
    schedule(directoryHandle: FileSystemDirectoryHandle, document: ProgressDocument) {
      pending = { handle: directoryHandle, doc: document };
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        void executeWrite();
      }, delayMs);
    },
    async flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (!pending && activeWrite) {
        return activeWrite;
      }
      return executeWrite();
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = null;
    },
  };
}
