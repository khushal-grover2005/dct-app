import { useCallback, useMemo, useRef, useState } from 'react';
import {
  assetExistsInDirectory,
  classifyAsset,
  computeFileSha256,
  getFileHandleByRelativePath,
  readFileTextSafe,
  removeAssetFromDirectory,
} from '../folder';
import type { ConsentedListResult } from '../list';
import type { AssetTagState, TaggingWorkspaceController } from '../tagging';
import {
  buildCorrectionSheetPreview,
  parseDeletionRequestIds,
  triggerCorrectionSheetDownload,
  writeCorrectionSheetToDirectory,
} from './correctionSheetWriter';
import type {
  CorrectionSheetPreview,
  DeletionRequestCheckResult,
  HeldAssetCardItem,
  HeldCorrectionOutcome,
  SaveCorrectionSheetResult,
} from './types';

export interface UseCorrectionsInput {
  controller: TaggingWorkspaceController;
  directoryHandle: FileSystemDirectoryHandle;
  consentedList: ConsentedListResult;
  collectionRef: string;
  onAssetRedacted?: (assetId: string, file: File, newSha256: string) => void;
  onAssetsDeleted?: (assetIds: string[]) => void;
}

export interface UseCorrectionsResult {
  heldAssets: HeldAssetCardItem[];
  redactingAssetIds: ReadonlySet<string>;
  pendingDeleteHeldAssetId: string | null;
  redactHeldAsset: (assetId: string) => Promise<void>;
  requestDeleteHeldAsset: (assetId: string) => Promise<void>;
  cancelDeleteHeldAsset: () => void;
  confirmDeleteHeldAsset: (assetId: string) => Promise<void>;

  deletionRequestText: string;
  setDeletionRequestText: (text: string) => void;
  loadDeletionRequestFile: (file: File) => Promise<void>;
  deletionCheckResult: DeletionRequestCheckResult | null;
  isCheckingDeletionRequests: boolean;
  isDeletingBatch: boolean;
  pendingBatchDeleteConfirm: boolean;
  deletionError: string | null;
  lastBatchDeletedIds: string[];
  checkDeletionRequests: () => Promise<DeletionRequestCheckResult>;
  requestBatchDelete: () => void;
  cancelBatchDelete: () => void;
  confirmBatchDelete: () => Promise<void>;

  stagedAssetIds: string[];
  preview: CorrectionSheetPreview | null;
  isSaving: boolean;
  saveError: string | null;
  lastSaved: SaveCorrectionSheetResult | null;
  saveCorrectionSheet: () => Promise<SaveCorrectionSheetResult | null>;
  downloadCorrectionSheet: () => void;
}

export function useCorrections({
  controller,
  directoryHandle,
  consentedList,
  collectionRef,
  onAssetRedacted,
  onAssetsDeleted,
}: UseCorrectionsInput): UseCorrectionsResult {
  const [redactingSet, setRedactingSet] = useState<Set<string>>(() => new Set());
  const [heldErrors, setHeldErrors] = useState<Record<string, string>>({});
  const [heldOutcomes, setHeldOutcomes] = useState<Record<string, HeldCorrectionOutcome>>({});
  const [pendingDeleteHeldAssetId, setPendingDeleteHeldAssetId] = useState<string | null>(null);

  const [deletionRequestText, setDeletionRequestTextState] = useState('');
  const [deletionCheckResult, setDeletionCheckResult] =
    useState<DeletionRequestCheckResult | null>(null);
  const [isCheckingDeletionRequests, setIsCheckingDeletionRequests] = useState(false);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [pendingBatchDeleteConfirm, setPendingBatchDeleteConfirm] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [lastBatchDeletedIds, setLastBatchDeletedIds] = useState<string[]>([]);

  const [stagedAssetIds, setStagedAssetIds] = useState<string[]>([]);
  const [extraDeletedAssets, setExtraDeletedAssets] = useState<Record<string, AssetTagState>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<SaveCorrectionSheetResult | null>(null);

  // Track which assets were in held state during this session so resolved cards remain visible
  const seenHeldIdsRef = useRef<Set<string>>(new Set());

  const assetById = useMemo(() => {
    const map = new Map<string, AssetTagState>();
    for (const asset of controller.state.assets) {
      map.set(asset.assetId, asset);
      if (asset.state === 'active' && asset.bystanderCount > 0) {
        seenHeldIdsRef.current.add(asset.assetId);
      }
    }
    return map;
  }, [controller.state.assets]);

  const heldAssets = useMemo<HeldAssetCardItem[]>(() => {
    const items: HeldAssetCardItem[] = [];
    for (const asset of controller.state.assets) {
      const outcome = heldOutcomes[asset.assetId];
      const isCurrentlyHeld = asset.state === 'active' && asset.bystanderCount > 0;
      const wasResolvedHere = outcome === 'redacted' || outcome === 'deleted';
      if (!isCurrentlyHeld && !(seenHeldIdsRef.current.has(asset.assetId) && wasResolvedHere)) {
        continue;
      }

      const resolvedOutcome: HeldCorrectionOutcome =
        asset.state === 'deleted'
          ? 'deleted'
          : outcome === 'redacted' && asset.bystanderCount === 0
            ? 'redacted'
            : 'pending';

      items.push({
        assetId: asset.assetId,
        assetType: asset.assetType,
        capturedAt: asset.capturedAt,
        sha256: asset.sha256,
        baselineSha256: asset.progressSha256 ?? asset.sha256 ?? null,
        personIds: asset.personIds,
        bystanderCount: asset.bystanderCount,
        outcome: resolvedOutcome,
        errorMessage: heldErrors[asset.assetId],
      });
    }
    return items;
  }, [controller.state.assets, heldErrors, heldOutcomes]);

  const stageAssetIds = useCallback((ids: string[]) => {
    setStagedAssetIds((prev) => {
      const seen = new Set(prev);
      const next = [...prev];
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          next.push(id);
        }
      }
      return next;
    });
    setLastSaved(null);
    setSaveError(null);
  }, []);

  const redactHeldAsset = useCallback(
    async (assetId: string) => {
      const asset = assetById.get(assetId);
      if (!asset) return;

      seenHeldIdsRef.current.add(assetId);
      setPendingDeleteHeldAssetId((curr) => (curr === assetId ? null : curr));
      setHeldErrors((prev) => {
        const next = { ...prev };
        delete next[assetId];
        return next;
      });
      setRedactingSet((prev) => new Set(prev).add(assetId));

      try {
        const handle = await getFileHandleByRelativePath(directoryHandle, assetId);
        const file = await handle.getFile();
        const freshSha256 = await computeFileSha256(file);
        const baselineSha256 = asset.progressSha256 ?? asset.sha256 ?? null;

        if (baselineSha256 && freshSha256.toLowerCase() === baselineSha256.toLowerCase()) {
          setHeldErrors((prev) => ({
            ...prev,
            [assetId]:
              'File SHA-256 is unchanged. Replace the asset file on disk with a redacted copy before clicking I redacted it.',
          }));
          return;
        }

        onAssetRedacted?.(assetId, file, freshSha256);
        controller.dispatch({
          type: 'APPLY_ASSET_REDACTION',
          assetId,
          newSha256: freshSha256,
        });
        setHeldOutcomes((prev) => ({ ...prev, [assetId]: 'redacted' }));
        stageAssetIds([assetId]);
      } catch (err) {
        setHeldErrors((prev) => ({
          ...prev,
          [assetId]:
            err instanceof Error
              ? `Could not re-read file for redaction check: ${err.message}`
              : 'Could not re-read file for redaction check.',
        }));
      } finally {
        setRedactingSet((prev) => {
          const next = new Set(prev);
          next.delete(assetId);
          return next;
        });
      }
    },
    [assetById, controller, directoryHandle, onAssetRedacted, stageAssetIds]
  );

  const finalizeHeldDelete = useCallback(
    (assetId: string) => {
      seenHeldIdsRef.current.add(assetId);
      controller.dispatch({ type: 'MARK_ASSETS_DELETED', assetIds: [assetId] });
      onAssetsDeleted?.([assetId]);
      setHeldOutcomes((prev) => ({ ...prev, [assetId]: 'deleted' }));
      setPendingDeleteHeldAssetId(null);
      stageAssetIds([assetId]);
    },
    [controller, onAssetsDeleted, stageAssetIds]
  );

  const requestDeleteHeldAsset = useCallback(
    async (assetId: string) => {
      setHeldErrors((prev) => {
        const next = { ...prev };
        delete next[assetId];
        return next;
      });

      const existsOnDisk = await assetExistsInDirectory(directoryHandle, assetId);
      if (!existsOnDisk) {
        // R-32: File already removed externally; record state = deleted immediately
        finalizeHeldDelete(assetId);
        return;
      }

      // File is still on disk; require single confirmation before removing it
      setPendingDeleteHeldAssetId(assetId);
    },
    [directoryHandle, finalizeHeldDelete]
  );

  const cancelDeleteHeldAsset = useCallback(() => {
    setPendingDeleteHeldAssetId(null);
  }, []);

  const confirmDeleteHeldAsset = useCallback(
    async (assetId: string) => {
      try {
        const existsOnDisk = await assetExistsInDirectory(directoryHandle, assetId);
        if (existsOnDisk) {
          await removeAssetFromDirectory(directoryHandle, assetId);
        }
        finalizeHeldDelete(assetId);
      } catch (err) {
        setPendingDeleteHeldAssetId(null);
        setHeldErrors((prev) => ({
          ...prev,
          [assetId]:
            err instanceof Error
              ? `Could not delete file from folder: ${err.message}`
              : 'Could not delete file from folder.',
        }));
      }
    },
    [directoryHandle, finalizeHeldDelete]
  );

  const setDeletionRequestText = useCallback((text: string) => {
    setDeletionRequestTextState(text);
    setPendingBatchDeleteConfirm(false);
    setDeletionError(null);
  }, []);

  const loadDeletionRequestFile = useCallback(async (file: File) => {
    try {
      const text = await readFileTextSafe(file);
      setDeletionRequestTextState(text);
      setPendingBatchDeleteConfirm(false);
      setDeletionError(null);
    } catch (err) {
      setDeletionError(
        err instanceof Error
          ? `Could not read deletion request file: ${err.message}`
          : 'Could not read deletion request file.'
      );
    }
  }, []);

  const checkDeletionRequests = useCallback(async (): Promise<DeletionRequestCheckResult> => {
    setIsCheckingDeletionRequests(true);
    setPendingBatchDeleteConfirm(false);
    setDeletionError(null);

    try {
      const requestedIds = parseDeletionRequestIds(deletionRequestText);
      const foundIds: string[] = [];
      const notFoundIds: string[] = [];

      for (const id of requestedIds) {
        const exists = await assetExistsInDirectory(directoryHandle, id);
        if (exists) {
          foundIds.push(id);
        } else {
          notFoundIds.push(id);
        }
      }

      const result: DeletionRequestCheckResult = {
        requestedIds,
        foundIds,
        notFoundIds,
      };
      setDeletionCheckResult(result);
      return result;
    } catch (err) {
      setDeletionError(
        err instanceof Error ? `Failed to check files: ${err.message}` : 'Failed to check files.'
      );
      const fallback: DeletionRequestCheckResult = {
        requestedIds: [],
        foundIds: [],
        notFoundIds: [],
      };
      setDeletionCheckResult(fallback);
      return fallback;
    } finally {
      setIsCheckingDeletionRequests(false);
    }
  }, [deletionRequestText, directoryHandle]);

  const requestBatchDelete = useCallback(() => {
    if (!deletionCheckResult || deletionCheckResult.foundIds.length === 0) return;
    setDeletionError(null);
    setPendingBatchDeleteConfirm(true);
  }, [deletionCheckResult]);

  const cancelBatchDelete = useCallback(() => {
    setPendingBatchDeleteConfirm(false);
  }, []);

  const confirmBatchDelete = useCallback(async () => {
    if (!deletionCheckResult || deletionCheckResult.foundIds.length === 0) return;

    setIsDeletingBatch(true);
    setDeletionError(null);
    const deletedIds: string[] = [];
    const fallbackEntries: Record<string, AssetTagState> = {};

    try {
      for (const id of deletionCheckResult.foundIds) {
        let sizeBytes = 0;
        let capturedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        if (!assetById.has(id)) {
          try {
            const fh = await getFileHandleByRelativePath(directoryHandle, id);
            const f = await fh.getFile();
            sizeBytes = f.size;
            capturedAt = new Date(f.lastModified).toISOString().replace(/\.\d{3}Z$/, 'Z');
          } catch {
            // Fall back to current timestamp and 0 bytes if metadata cannot be inspected
          }
        }

        const exists = await assetExistsInDirectory(directoryHandle, id);
        if (exists) {
          await removeAssetFromDirectory(directoryHandle, id);
        }
        deletedIds.push(id);

        if (!assetById.has(id)) {
          fallbackEntries[id] = {
            assetId: id,
            assetType: classifyAsset(id),
            capturedAt,
            captureTimeSource: 'last_modified',
            sizeBytes,
            personIds: [],
            bystanderCount: 0,
            noPerson: false,
            reviewedToEnd: false,
            externalReviewConfirmed: false,
            state: 'deleted',
            presenceStatus: 'deleted',
          };
        }
      }

      if (Object.keys(fallbackEntries).length > 0) {
        setExtraDeletedAssets((prev) => ({ ...prev, ...fallbackEntries }));
      }
      if (deletedIds.length > 0) {
        controller.dispatch({ type: 'MARK_ASSETS_DELETED', assetIds: deletedIds });
        onAssetsDeleted?.(deletedIds);
        setHeldOutcomes((prev) => {
          const next = { ...prev };
          for (const id of deletedIds) {
            if (seenHeldIdsRef.current.has(id)) {
              next[id] = 'deleted';
            }
          }
          return next;
        });
        stageAssetIds(deletedIds);
        setLastBatchDeletedIds(deletedIds);
      }

      setPendingBatchDeleteConfirm(false);
      setDeletionCheckResult((prev) =>
        prev
          ? {
              ...prev,
              foundIds: [],
            }
          : null
      );
    } catch (err) {
      setDeletionError(
        err instanceof Error
          ? `Could not delete requested files: ${err.message}`
          : 'Could not delete requested files.'
      );
    } finally {
      setIsDeletingBatch(false);
    }
  }, [assetById, controller, deletionCheckResult, directoryHandle, onAssetsDeleted, stageAssetIds]);

  const stagedTargets = useMemo<AssetTagState[]>(() => {
    const resolved: AssetTagState[] = [];
    for (const id of stagedAssetIds) {
      const fromWorkspace = assetById.get(id);
      if (fromWorkspace) {
        resolved.push(fromWorkspace);
      } else if (extraDeletedAssets[id]) {
        resolved.push(extraDeletedAssets[id]);
      }
    }
    return resolved;
  }, [assetById, extraDeletedAssets, stagedAssetIds]);

  const existingSaveNames = useMemo(
    () => new Set(controller.saves.map((entry) => entry.file)),
    [controller.saves]
  );

  const preview = useMemo<CorrectionSheetPreview | null>(() => {
    if (stagedTargets.length === 0) return null;
    return buildCorrectionSheetPreview(
      stagedTargets,
      consentedList,
      collectionRef,
      new Date(),
      undefined,
      existingSaveNames
    );
  }, [collectionRef, consentedList, existingSaveNames, stagedTargets]);

  const saveCorrectionSheet = useCallback(async (): Promise<SaveCorrectionSheetResult | null> => {
    if (stagedTargets.length === 0) return null;
    setIsSaving(true);
    setSaveError(null);

    const snapshot = buildCorrectionSheetPreview(
      stagedTargets,
      consentedList,
      collectionRef,
      new Date(),
      undefined,
      new Set(controller.saves.map((entry) => entry.file))
    );

    if (!snapshot.valid) {
      const firstError =
        snapshot.errors[0]?.message ?? 'Correction sheet failed validation and cannot be saved.';
      setSaveError(firstError);
      setIsSaving(false);
      return null;
    }

    try {
      await writeCorrectionSheetToDirectory(directoryHandle, snapshot.fileName, snapshot.csvText);
      await controller.recordSave(
        {
          export_id: snapshot.exportId,
          file: snapshot.fileName,
          saved_at: snapshot.exportedAt,
          held: [],
        },
        controller.state.assets
      );

      const saved: SaveCorrectionSheetResult = {
        saved: true,
        fileName: snapshot.fileName,
        exportId: snapshot.exportId,
        savedAt: snapshot.exportedAt,
        csvText: snapshot.csvText,
        rowCount: snapshot.rowCount,
      };
      setLastSaved(saved);
      setStagedAssetIds([]);
      return saved;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not write correction sheet to folder.';
      setSaveError(message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [collectionRef, consentedList, controller, directoryHandle, stagedTargets]);

  const downloadCorrectionSheet = useCallback(() => {
    if (lastSaved) {
      triggerCorrectionSheetDownload(lastSaved.fileName, lastSaved.csvText);
      return;
    }
    if (preview && preview.valid) {
      triggerCorrectionSheetDownload(preview.fileName, preview.csvText);
    }
  }, [lastSaved, preview]);

  return {
    heldAssets,
    redactingAssetIds: redactingSet,
    pendingDeleteHeldAssetId,
    redactHeldAsset,
    requestDeleteHeldAsset,
    cancelDeleteHeldAsset,
    confirmDeleteHeldAsset,
    deletionRequestText,
    setDeletionRequestText,
    loadDeletionRequestFile,
    deletionCheckResult,
    isCheckingDeletionRequests,
    isDeletingBatch,
    pendingBatchDeleteConfirm,
    deletionError,
    lastBatchDeletedIds,
    checkDeletionRequests,
    requestBatchDelete,
    cancelBatchDelete,
    confirmBatchDelete,
    stagedAssetIds,
    preview,
    isSaving,
    saveError,
    lastSaved,
    saveCorrectionSheet,
    downloadCorrectionSheet,
  };
}
