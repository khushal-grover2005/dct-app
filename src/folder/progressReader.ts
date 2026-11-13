import { z } from 'zod';
import {
  PROGRESS_FILE_NAME,
  type ProgressAssetEntry,
  type ProgressCaptureSource,
  type ProgressDocument,
} from './progressWriter';
import { readFileTextSafe } from './fsHelpers';
import type { CaptureTimeSource, IngestedAsset } from './types';

const ASSET_TYPE_SCHEMA = z.enum([
  'image',
  'video',
  'audio',
  'sensor',
  'document',
  'other',
]);

const CAPTURE_SOURCE_SCHEMA = z.enum(['exif', 'media_header', 'file_modified']);
const ASSET_STATE_SCHEMA = z.enum(['active', 'deleted']);
const LOWERCASE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ProgressAssetEntrySchema = z.object({
  sha256: z.string().nullable(),
  captured_at: z.string(),
  captured_at_source: CAPTURE_SOURCE_SCHEMA,
  asset_type: ASSET_TYPE_SCHEMA,
  person_ids: z.array(z.string()).default([]),
  bystander_count: z.number().int().min(0).max(20).default(0),
  no_person: z.boolean().default(false),
  reviewed_to_end: z.boolean().optional().default(false),
  external_review_confirmed: z.boolean().optional().default(false),
  state: ASSET_STATE_SCHEMA.optional().default('active'),
});

const ProgressSaveEntrySchema = z.object({
  export_id: z.string().regex(LOWERCASE_UUID_RE, 'export_id must be a lowercase UUID'),
  file: z.string().min(1),
  saved_at: z.string(),
  held: z.array(z.string()).default([]),
});

export const ProgressDocumentSchema = z.object({
  format: z.literal('dct.progress'),
  format_version: z.literal(1),
  collection_ref: z.string().min(1),
  project_id: z.string().regex(LOWERCASE_UUID_RE, 'project_id must be a lowercase UUID'),
  list_generated_at: z.string(),
  assets: z.record(z.string(), ProgressAssetEntrySchema),
  saves: z.array(ProgressSaveEntrySchema).optional().default([]),
});

export type AssetDiscrepancyKind = 'none' | 'missing' | 'untagged' | 'changed' | 'deleted';

export interface ReconciledAssetEntry {
  assetId: string;
  diskAsset?: IngestedAsset;
  progressEntry?: ProgressAssetEntry;
  discrepancy: AssetDiscrepancyKind;
  isHeldFromSave: boolean;
  /** Recorded SHA-256 baseline from the progress file when held or previously saved. */
  progressSha256: string | null;
}

export interface ProgressReconciliationSummary {
  missingIds: string[];
  untaggedNewIds: string[];
  changedIds: string[];
  deletedIds: string[];
  restoredTaggedCount: number;
  heldFromSaveIds: string[];
}

export interface ProgressReconciliationResult {
  items: ReconciledAssetEntry[];
  summary: ProgressReconciliationSummary;
}

export interface ReadProgressResult {
  found: boolean;
  document: ProgressDocument | null;
  error?: string;
}

export interface ListDeletionReminderStatus {
  due: boolean;
  daysSinceLastSave: number | null;
  lastSavedAt: string | null;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function fromProgressCaptureSource(source: ProgressCaptureSource): CaptureTimeSource {
  switch (source) {
    case 'exif':
      return 'exif';
    case 'media_header':
      return 'mp4box';
    case 'file_modified':
      return 'last_modified';
  }
}

/**
 * Parses and validates raw JSON text of a `.dct-progress.json` file.
 * Extra unknown fields are stripped by Zod so only identifier metadata enters memory.
 */
export function parseProgressJson(jsonText: string): {
  document: ProgressDocument | null;
  error?: string;
} {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (err) {
    return {
      document: null,
      error: `Invalid JSON in ${PROGRESS_FILE_NAME}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  const parsed = ProgressDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const issuePath = firstIssue?.path.join('.') || 'root';
    return {
      document: null,
      error: `Invalid progress file schema at '${issuePath}': ${
        firstIssue?.message ?? 'validation failed'
      }`,
    };
  }

  return { document: parsed.data };
}

/**
 * Attempts to read `.dct-progress.json` from a collection directory handle.
 */
export async function readProgressFile(
  directoryHandle: FileSystemDirectoryHandle
): Promise<ReadProgressResult> {
  if (typeof directoryHandle.getFileHandle !== 'function') {
    return { found: false, document: null };
  }

  let fileHandle: FileSystemFileHandle;
  try {
    fileHandle = await directoryHandle.getFileHandle(PROGRESS_FILE_NAME, { create: false });
  } catch (err) {
    // Expected when folder does not yet have a progress file
    const name = err instanceof Error ? err.name : '';
    const msg = err instanceof Error ? err.message : String(err);
    if (name === 'NotFoundError' || /not\s*found/i.test(msg)) {
      return { found: false, document: null };
    }
    return { found: false, document: null };
  }

  try {
    const file = await fileHandle.getFile();
    const text = await readFileTextSafe(file);
    const parsed = parseProgressJson(text);
    if (!parsed.document) {
      return { found: true, document: null, error: parsed.error };
    }
    return { found: true, document: parsed.document };
  } catch (err) {
    return {
      found: true,
      document: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Computes which assets currently remain held due to bystanders recorded in previous saves.
 */
export function getActiveHeldAssetIds(progress: ProgressDocument): Set<string> {
  const heldEver = new Set<string>();
  for (const save of progress.saves) {
    for (const assetId of save.held) {
      heldEver.add(assetId);
    }
  }

  const activeHeld = new Set<string>();
  for (const assetId of heldEver) {
    const entry = progress.assets[assetId];
    if (entry && entry.state === 'active' && entry.bystander_count > 0) {
      activeHeld.add(assetId);
    }
  }
  return activeHeld;
}

/**
 * Reconciles scanned folder files with `.dct-progress.json` (UC-05, R-23, T-10):
 * - Missing on disk (active in progress): flagged `missing`
 * - New on disk (absent from progress): flagged `untagged`
 * - Modified bytes (hash differs from recorded progress hash): flagged `changed`
 * - Intentionally deleted in progress: preserved as `deleted`
 */
export function reconcileFolderWithProgress(
  diskAssets: IngestedAsset[],
  progress: ProgressDocument,
  currentHashes?: Record<string, string>
): ProgressReconciliationResult {
  const diskById = new Map<string, IngestedAsset>();
  for (const asset of diskAssets) {
    diskById.set(asset.assetId, asset);
  }

  const activeHeldIds = getActiveHeldAssetIds(progress);
  const allAssetIds = new Set<string>([
    ...diskById.keys(),
    ...Object.keys(progress.assets),
  ]);

  const items: ReconciledAssetEntry[] = [];
  const missingIds: string[] = [];
  const untaggedNewIds: string[] = [];
  const changedIds: string[] = [];
  const deletedIds: string[] = [];
  const heldFromSaveIds: string[] = [];
  let restoredTaggedCount = 0;

  for (const assetId of allAssetIds) {
    const diskAsset = diskById.get(assetId);
    const progressEntry = progress.assets[assetId];
    const isHeldFromSave = activeHeldIds.has(assetId);

    if (isHeldFromSave) {
      heldFromSaveIds.push(assetId);
    }

    if (diskAsset && progressEntry) {
      const diskSha = currentHashes?.[assetId] ?? diskAsset.sha256;
      const progSha = progressEntry.sha256;
      let discrepancy: AssetDiscrepancyKind = 'none';

      if (progressEntry.state === 'deleted') {
        // File exists on disk despite previously being marked deleted
        discrepancy = 'changed';
        changedIds.push(assetId);
      } else if (progSha && diskSha && diskSha !== progSha) {
        discrepancy = 'changed';
        changedIds.push(assetId);
      } else if (
        progressEntry.person_ids.length > 0 ||
        progressEntry.no_person ||
        progressEntry.bystander_count > 0
      ) {
        restoredTaggedCount++;
      }

      items.push({
        assetId,
        diskAsset,
        progressEntry,
        discrepancy,
        isHeldFromSave,
        progressSha256: progSha,
      });
    } else if (diskAsset && !progressEntry) {
      untaggedNewIds.push(assetId);
      items.push({
        assetId,
        diskAsset,
        discrepancy: 'untagged',
        isHeldFromSave: false,
        progressSha256: null,
      });
    } else if (!diskAsset && progressEntry) {
      if (progressEntry.state === 'deleted') {
        deletedIds.push(assetId);
        items.push({
          assetId,
          progressEntry,
          discrepancy: 'deleted',
          isHeldFromSave: false,
          progressSha256: progressEntry.sha256,
        });
      } else {
        missingIds.push(assetId);
        items.push({
          assetId,
          progressEntry,
          discrepancy: 'missing',
          isHeldFromSave,
          progressSha256: progressEntry.sha256,
        });
      }
    }
  }

  const naturalCompare = (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

  items.sort((a, b) => naturalCompare(a.assetId, b.assetId));
  missingIds.sort(naturalCompare);
  untaggedNewIds.sort(naturalCompare);
  changedIds.sort(naturalCompare);
  deletedIds.sort(naturalCompare);
  heldFromSaveIds.sort(naturalCompare);

  return {
    items,
    summary: {
      missingIds,
      untaggedNewIds,
      changedIds,
      deletedIds,
      restoredTaggedCount,
      heldFromSaveIds,
    },
  };
}

/**
 * Checks whether the latest saved export in `.dct-progress.json` is over 7 days old (R-37, T-14).
 */
export function isListDeletionReminderDue(
  progress: ProgressDocument | null,
  now: Date = new Date()
): ListDeletionReminderStatus {
  if (!progress || progress.saves.length === 0) {
    return { due: false, daysSinceLastSave: null, lastSavedAt: null };
  }

  let latestSaveMs = -Infinity;
  let latestSaveIso: string | null = null;

  for (const save of progress.saves) {
    const ms = Date.parse(save.saved_at);
    if (!Number.isNaN(ms) && ms > latestSaveMs) {
      latestSaveMs = ms;
      latestSaveIso = save.saved_at;
    }
  }

  if (latestSaveIso === null) {
    return { due: false, daysSinceLastSave: null, lastSavedAt: null };
  }

  const ageMs = now.getTime() - latestSaveMs;
  const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  return {
    due: ageMs > SEVEN_DAYS_MS,
    daysSinceLastSave: Math.max(0, days),
    lastSavedAt: latestSaveIso,
  };
}
