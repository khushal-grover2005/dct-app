import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  FolderScanResult,
  IngestedAsset,
  AggregateProgress,
  HashManager,
  scanFolder,
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
      setHashingCompleted(false);
      setHashingProgress(INITIAL_PROGRESS);
      setAssetHashes({});

      try {
        const scanResult: FolderScanResult = await scanFolder(handle);
        setAssets(scanResult.assets);
        setFolderWarnings(scanResult.warnings);
        setCollectionRef((prev) => prev || scanResult.folderName);
        setFolderScanning(false);

        // If a consented list was already loaded, synchronize participant selectability
        // against the newly scanned collection capture time
        if (scanResult.assets.length > 0 && scanResult.assets[0]?.capturedAt) {
          const refTime = scanResult.assets[0].capturedAt;
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
  const loadListFromText = useCallback(
    (csvText: string, fileName?: string) => {
      setListLoading(true);
      if (fileName) {
        setListFileName(fileName);
      }

      // If assets are already ingested, evaluate against first asset capture time;
      // otherwise evaluate against current time
      const refTime = assets.length > 0 && assets[0]?.capturedAt ? assets[0].capturedAt : new Date();

      const result = loadConsentedList(csvText, {
        referenceTime: refTime,
      });

      if (result.success) {
        setConsentedList(result.data);
        setListErrors([]);
      } else {
        setConsentedList(null); // Refuse whole list
        setListErrors(result.errors);
      }
      setListLoading(false);
    },
    [assets]
  );

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
    setHashingProgress(INITIAL_PROGRESS);
    setHashingCompleted(false);
    setAssetHashes({});
    setConsentedList(null);
    setListLoading(false);
    setListErrors([]);
    setListFileName(null);
  }, []);

  // Derived readiness: Folder scanned with assets, no active scan, valid consented list
  const isReadyForTagging = useMemo(() => {
    return Boolean(
      directoryHandle !== null &&
        assets.length > 0 &&
        !folderScanning &&
        consentedList !== null &&
        listErrors.length === 0
    );
  }, [directoryHandle, assets.length, folderScanning, consentedList, listErrors.length]);

  return {
    directoryHandle,
    folderName,
    assets,
    folderScanning,
    folderWarnings,
    collectionRef,
    setCollectionRef,
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
    resetAll,
    isReadyForTagging,
  };
}
