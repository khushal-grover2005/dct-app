import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  FolderScanResult,
  IngestedAsset,
  AggregateProgress,
  HashManager,
  scanFolder,
  readProgressFile,
  reconcileFolderWithProgress,
  isListDeletionReminderDue,
  type ProgressDocument,
} from '../folder';
import {
  ConsentedListResult,
  ListValidationError,
  loadConsentedList,
  evaluateSelectability,
} from '../list';
import type { AppPipeline } from '../ui/types';

export interface UseAppPipelineOptions {
  workerFactory?: () => Worker;
}

const INITIAL_PROGRESS: AggregateProgress = {
  totalAssets: 0,
  completedAssets: 0,
  totalBytes: 0,
  processedBytes: 0,
  overallPercent: 0,
};

export function useAppPipeline(options?: UseAppPipelineOptions): AppPipeline {
  // Folder state
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [assets, setAssets] = useState<IngestedAsset[]>([]);
  const [folderScanning, setFolderScanning] = useState(false);
  const [folderWarnings, setFolderWarnings] = useState<string[]>([]);
  const [collectionRef, setCollectionRef] = useState('');

  // Resume / Progress file state
  const [detectedProgress, setDetectedProgress] = useState<ProgressDocument | null>(null);
  const [progressReadError, setProgressReadError] = useState<string | null>(null);

  // Hashing state
  const [hashingProgress, setHashingProgress] = useState<AggregateProgress>(INITIAL_PROGRESS);
  const [hashingCompleted, setHashingCompleted] = useState(false);
  const [assetHashes, setAssetHashes] = useState<Record<string, string>>({});

  // List state
  const [consentedList, setConsentedList] = useState<ConsentedListResult | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listErrors, setListErrors] = useState<ListValidationError[]>([]);
  const [listFileName, setListFileName] = useState<string | null>(null);

  // References
  const hashManagerRef = useRef<HashManager | null>(null);
  const detectedProgressRef = useRef<ProgressDocument | null>(null);
  const consentedListRef = useRef<ConsentedListResult | null>(null);
  const assetsRef = useRef<IngestedAsset[]>([]);

  detectedProgressRef.current = detectedProgress;
  consentedListRef.current = consentedList;
  assetsRef.current = assets;

  // Web Worker cleanup on unmount
  useEffect(() => {
    return () => {
      hashManagerRef.current?.dispose();
      hashManagerRef.current = null;
    };
  }, []);

  // Internal folder ingestion logic
  const ingestFolderHandle = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      // 1. Dispose any existing worker pool
      if (hashManagerRef.current) {
        hashManagerRef.current.dispose();
        hashManagerRef.current = null;
      }

      setDirectoryHandle(handle);
      setFolderName(handle.name);
      setFolderScanning(true);
      setFolderWarnings([]);
      setDetectedProgress(null);
      setProgressReadError(null);
      setHashingCompleted(false);
      setHashingProgress(INITIAL_PROGRESS);
      setAssetHashes({});

      try {
        const [scanResult, progressRead]: [
          FolderScanResult,
          Awaited<ReturnType<typeof readProgressFile>>,
        ] = await Promise.all([scanFolder(handle), readProgressFile(handle)]);

        const loadedProgress = progressRead.document;
        setAssets(scanResult.assets);
        setFolderWarnings(scanResult.warnings);
        setDetectedProgress(loadedProgress);
        setProgressReadError(progressRead.error ?? null);

        if (loadedProgress?.collection_ref) {
          setCollectionRef(loadedProgress.collection_ref);
        } else {
          setCollectionRef((prev) => prev || scanResult.folderName);
        }

        setFolderScanning(false);

        // Enforce R-09 if a consented list was loaded BEFORE this folder was opened
        const currentList = consentedListRef.current;
        if (currentList && loadedProgress && currentList.projectId !== loadedProgress.project_id) {
          setConsentedList(null);
          setListErrors([
            {
              code: 'RESUME_MISMATCH',
              message: `This collection was tagged under project ${loadedProgress.project_id}; cannot use a list for ${currentList.projectId}`,
            },
          ]);
        } else if (currentList) {
          // Synchronize participant selectability against collection capture time
          const fallbackProgTime = loadedProgress
            ? Object.values(loadedProgress.assets)[0]?.captured_at
            : undefined;
          const refTime = scanResult.assets[0]?.capturedAt ?? fallbackProgTime;
          if (refTime) {
            setConsentedList((prevList) => {
              if (!prevList) return null;
              let selectableCount = 0;
              const updatedPeople = prevList.people.map((person) => {
                const res = evaluateSelectability(person.isMinor, person.consentExpiresAt, {
                  referenceTime: refTime,
                  listValidUntil: prevList.listValidUntil,
                });
                if (res.isSelectable) {
                  selectableCount++;
                }
                return {
                  ...person,
                  isSelectable: res.isSelectable,
                  nonSelectableReason: res.reason,
                  formattedReason: res.formattedReason,
                };
              });
              return {
                ...prevList,
                people: updatedPeople,
                selectableCount,
              };
            });
          }
        }

        if (scanResult.assets.length === 0) {
          setHashingCompleted(true);
          setHashingProgress({
            totalAssets: 0,
            completedAssets: 0,
            totalBytes: 0,
            processedBytes: 0,
            overallPercent: 100,
          });
          return;
        }

        // 2. Start background worker hashing
        const manager = new HashManager({
          maxConcurrency: 2,
          workerFactory: options?.workerFactory,
          onAggregateProgress: (progress) => {
            setHashingProgress({ ...progress });
          },
        });
        hashManagerRef.current = manager;

        const hashPromises = scanResult.assets.map((asset) => {
          return new Promise<void>((resolve) => {
            const jobId = `job_${asset.assetId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            manager.enqueue({
              jobId,
              assetId: asset.assetId,
              file: asset.file,
              onProgress: (p) => {
                asset.hashProgress = p.percent;
              },
              onDone: ({ sha256 }) => {
                asset.sha256 = sha256;
                asset.hashProgress = 100;
                setAssetHashes((prev) => ({ ...prev, [asset.assetId]: sha256 }));
                resolve();
              },
              onError: (err) => {
                setFolderWarnings((prev) => [
                  ...prev,
                  `Failed to hash '${asset.assetId}': ${err.message}`,
                ]);
                resolve();
              },
              onCancelled: () => {
                resolve();
              },
            });
          });
        });

        await Promise.all(hashPromises);

        // Guard against stale completion if another folder was opened
        if (hashManagerRef.current === manager) {
          setHashingCompleted(true);
          setAssets([...scanResult.assets]);
        }
      } catch (err) {
        setFolderScanning(false);
        const msg = err instanceof Error ? err.message : String(err);
        setFolderWarnings((prev) => [...prev, `Failed to scan directory: ${msg}`]);
      }
    },
    [options?.workerFactory]
  );

  // Action: Open folder via FSA API
  const openFolder = useCallback(async () => {
    if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
      setFolderWarnings((prev) => [
        ...prev,
        'File System Access API is not supported in this browser.',
      ]);
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await ingestFolderHandle(handle);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled folder picker dialog - retain existing state
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setFolderWarnings((prev) => [...prev, `Folder selection error: ${msg}`]);
    }
  }, [ingestFolderHandle]);

  // Action: Load list from CSV text
  const loadListFromText = useCallback((csvText: string, fileName?: string) => {
    setListLoading(true);
    if (fileName) {
      setListFileName(fileName);
    }

    const activeAssets = assetsRef.current;
    const progress = detectedProgressRef.current;
    const fallbackProgTime = progress
      ? Object.values(progress.assets)[0]?.captured_at
      : undefined;
    const refTime = activeAssets[0]?.capturedAt ?? fallbackProgTime ?? new Date();

    const result = loadConsentedList(csvText, {
      referenceTime: refTime,
      expectedProjectId: progress?.project_id,
    });

    if (result.success) {
      setConsentedList(result.data);
      setListErrors([]);
    } else {
      setConsentedList(null); // Refuse whole list
      setListErrors(result.errors);
    }
    setListLoading(false);
  }, []);

  // Action: Load list from File
  const loadListFromFile = useCallback(
    async (file: File) => {
      setListFileName(file.name);
      setListLoading(true);
      try {
        const buffer = await file.arrayBuffer();
        const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
        const text = decoder.decode(buffer);
        loadListFromText(text, file.name);
      } catch (err) {
        setConsentedList(null);
        setListErrors([
          {
            code: 'CSV_PARSE_ERROR',
            message: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
          },
        ]);
        setListLoading(false);
      }
    },
    [loadListFromText]
  );

  // Reflect physical deletions from Corrections without re-running full worker pool
  const markFilesDeleted = useCallback((assetIds: string[]) => {
    const removedSet = new Set(assetIds);
    if (removedSet.size === 0) return;

    setAssets((prev) => prev.filter((a) => !removedSet.has(a.assetId)));
    setAssetHashes((prev) => {
      const next = { ...prev };
      for (const id of removedSet) {
        delete next[id];
      }
      return next;
    });
  }, []);

  // Reflect freshly re-hashed redacted asset in pipeline lookup
  const updateRedactedAssetFile = useCallback(
    (assetId: string, file: File, newSha256: string) => {
      setAssets((prev) =>
        prev.map((a) =>
          a.assetId === assetId
            ? {
                ...a,
                file,
                sizeBytes: file.size,
                sha256: newSha256,
                hashProgress: 100,
              }
            : a
        )
      );
      setAssetHashes((prev) => ({ ...prev, [assetId]: newSha256 }));
    },
    []
  );

  // Action: Reset
  const resetAll = useCallback(() => {
    hashManagerRef.current?.dispose();
    hashManagerRef.current = null;
    setDirectoryHandle(null);
    setFolderName(null);
    setAssets([]);
    setFolderScanning(false);
    setFolderWarnings([]);
    setCollectionRef('');
    setDetectedProgress(null);
    setProgressReadError(null);
    setHashingProgress(INITIAL_PROGRESS);
    setHashingCompleted(false);
    setAssetHashes({});
    setConsentedList(null);
    setListLoading(false);
    setListErrors([]);
    setListFileName(null);
  }, []);

  const reconciliation = useMemo(() => {
    if (!detectedProgress) return null;
    return reconcileFolderWithProgress(assets, detectedProgress, assetHashes);
  }, [assets, detectedProgress, assetHashes]);

  const listDeletionReminder = useMemo(
    () => isListDeletionReminderDue(detectedProgress),
    [detectedProgress]
  );

  // Derived readiness: Folder scanned (has disk files or resumed progress), no active scan, valid consented list
  const isReadyForTagging = useMemo(() => {
    const hasAssetsOrProgress =
      assets.length > 0 ||
      (detectedProgress !== null && Object.keys(detectedProgress.assets).length > 0);
    return Boolean(
      directoryHandle !== null &&
        hasAssetsOrProgress &&
        !folderScanning &&
        consentedList !== null &&
        listErrors.length === 0
    );
  }, [
    directoryHandle,
    assets.length,
    detectedProgress,
    folderScanning,
    consentedList,
    listErrors.length,
  ]);

  return {
    directoryHandle,
    folderName,
    assets,
    folderScanning,
    folderWarnings,
    collectionRef,
    setCollectionRef,
    detectedProgress,
    progressReadError,
    reconciliation,
    listDeletionReminder,
    hashingProgress,
    hashingCompleted,
    assetHashes,
    consentedList,
    listLoading,
    listErrors,
    listFileName,
    openFolder,
    openFolderFromHandle: ingestFolderHandle,
    loadListFromFile,
    loadListFromText,
    markFilesDeleted,
    updateRedactedAssetFile,
    resetAll,
    isReadyForTagging,
  };
}
