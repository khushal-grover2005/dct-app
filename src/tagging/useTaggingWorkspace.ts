import { useReducer, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  buildProgressDocument,
  createDebouncedProgressSaver,
  type IngestedAsset,
  type ProgressSaveEntry,
} from '../folder';
import type { ConsentedListResult } from '../list';
import {
  INITIAL_TAGGING_WORKSPACE_STATE,
  taggingReducer,
  type TaggingAction,
} from './reducer';
import {
  computeWorkspaceStats,
  filterWorkspaceAssets,
} from './selectors';
import type {
  AssetTagState,
  TaggingWorkspaceState,
  WorkspaceStats,
} from './types';

export interface UseTaggingWorkspaceInput {
  directoryHandle: FileSystemDirectoryHandle | null;
  assets: IngestedAsset[];
  assetHashes: Record<string, string>;
  consentedList: ConsentedListResult | null;
  collectionRef: string;
}

export type ProgressSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface TaggingWorkspaceController {
  state: TaggingWorkspaceState;
  dispatch: React.Dispatch<TaggingAction>;
  filteredAssets: AssetTagState[];
  activeAsset: AssetTagState | null;
  activeIngestedAsset: IngestedAsset | null;
  stats: WorkspaceStats;
  fileLookup: Map<string, File>;
  saves: ProgressSaveEntry[];
  saveStatus: ProgressSaveStatus;
  lastSaveError: string | null;
  flushProgress: () => Promise<void>;
  recordSave: (entry: ProgressSaveEntry) => Promise<void>;
}

export function useTaggingWorkspace({
  directoryHandle,
  assets,
  assetHashes,
  consentedList,
  collectionRef,
}: UseTaggingWorkspaceInput): TaggingWorkspaceController {
  const [state, dispatch] = useReducer(
    taggingReducer,
    INITIAL_TAGGING_WORKSPACE_STATE
  );
  const [saveStatus, setSaveStatus] = useState<ProgressSaveStatus>('idle');
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const [saves, setSaves] = useState<ProgressSaveEntry[]>([]);

  const prevDirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const savesRef = useRef<ProgressSaveEntry[]>([]);
  const lastSavedDigestRef = useRef<string>('');
  const mountedRef = useRef(true);

  const saverRef = useRef<ReturnType<typeof createDebouncedProgressSaver> | null>(null);
  if (!saverRef.current) {
    saverRef.current = createDebouncedProgressSaver(1000, (result) => {
      if (!mountedRef.current) return;
      if (result.written) {
        setSaveStatus('saved');
        setLastSaveError(null);
      } else {
        setSaveStatus('error');
        setLastSaveError(result.error ?? 'Could not write progress file');
      }
    });
  }

  useEffect(() => {
    mountedRef.current = true;
    const saver = saverRef.current;
    return () => {
      mountedRef.current = false;
      saver?.cancel();
    };
  }, []);

  // Sync ingested folder assets and background SHA-256 updates into tagging state
  useEffect(() => {
    const dirChanged = prevDirHandleRef.current !== directoryHandle;
    prevDirHandleRef.current = directoryHandle;

    if (dirChanged) {
      lastSavedDigestRef.current = '';
      savesRef.current = [];
      setSaves([]);
      setSaveStatus('idle');
      setLastSaveError(null);
    }

    dispatch({
      type: 'SYNC_ASSETS',
      assets,
      assetHashes,
      resetTags: dirChanged,
    });
  }, [directoryHandle, assets, assetHashes]);

  // Fast File lookup by assetId
  const fileLookup = useMemo(() => {
    const map = new Map<string, File>();
    for (const a of assets) {
      map.set(a.assetId, a.file);
    }
    return map;
  }, [assets]);

  const ingestedLookup = useMemo(() => {
    const map = new Map<string, IngestedAsset>();
    for (const a of assets) {
      map.set(a.assetId, a);
    }
    return map;
  }, [assets]);

  const filteredAssets = useMemo(
    () =>
      filterWorkspaceAssets(
        state.assets,
        state.statusFilter,
        state.typeFilter,
        state.assetSearchQuery
      ),
    [state.assets, state.statusFilter, state.typeFilter, state.assetSearchQuery]
  );

  const activeAsset = useMemo(
    () => state.assets.find((a) => a.assetId === state.activeAssetId) ?? null,
    [state.assets, state.activeAssetId]
  );

  const activeIngestedAsset = useMemo(
    () => (activeAsset ? ingestedLookup.get(activeAsset.assetId) ?? null : null),
    [activeAsset, ingestedLookup]
  );

  const stats = useMemo(() => computeWorkspaceStats(state.assets), [state.assets]);

  // Debounced (1s) identifiers-only write to .dct-progress.json whenever tags/hashes change
  useEffect(() => {
    if (!directoryHandle || !consentedList || state.assets.length === 0) {
      return;
    }

    const doc = buildProgressDocument({
      collectionRef: collectionRef || directoryHandle.name,
      projectId: consentedList.projectId,
      listGeneratedAt: consentedList.listGeneratedAt,
      assets: state.assets,
      saves,
    });

    const digest = JSON.stringify(doc);
    if (digest === lastSavedDigestRef.current) {
      return;
    }

    // Avoid writing a blank progress file before user makes any tagging/review interaction
    const hasAnyUserState = state.assets.some(
      (a) =>
        a.personIds.length > 0 ||
        a.bystanderCount > 0 ||
        a.noPerson ||
        a.reviewedToEnd ||
        a.externalReviewConfirmed
    ) || saves.length > 0;
    if (!hasAnyUserState && lastSavedDigestRef.current === '') {
      return;
    }

    lastSavedDigestRef.current = digest;
    setSaveStatus('saving');
    saverRef.current?.schedule(directoryHandle, doc);
  }, [directoryHandle, consentedList, collectionRef, saves, state.assets]);

  const flushProgress = useCallback(async () => {
    await saverRef.current?.flush();
  }, []);

  const recordSave = useCallback(
    async (entry: ProgressSaveEntry) => {
      if (!directoryHandle || !consentedList) {
        throw new Error('A collection folder and consented list are required to record a save.');
      }
      const nextSaves = [...savesRef.current, entry];
      savesRef.current = nextSaves;
      setSaves(nextSaves);

      const document = buildProgressDocument({
        collectionRef: collectionRef || directoryHandle.name,
        projectId: consentedList.projectId,
        listGeneratedAt: consentedList.listGeneratedAt,
        assets: state.assets,
        saves: nextSaves,
      });
      lastSavedDigestRef.current = JSON.stringify(document);
      setSaveStatus('saving');
      saverRef.current?.schedule(directoryHandle, document);
      const result = await saverRef.current?.flush();
      if (!result?.written) {
        const error = result?.error ?? 'Could not write progress file';
        setSaveStatus('error');
        setLastSaveError(error);
        throw new Error(error);
      }
      setSaveStatus('saved');
      setLastSaveError(null);
    },
    [collectionRef, consentedList, directoryHandle, state.assets]
  );

  return {
    state,
    dispatch,
    filteredAssets,
    activeAsset,
    activeIngestedAsset,
    stats,
    fileLookup,
    saves,
    saveStatus,
    lastSaveError,
    flushProgress,
    recordSave,
  };
}
