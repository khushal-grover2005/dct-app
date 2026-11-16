import {
  fromProgressCaptureSource,
  reconcileFolderWithProgress,
  type IngestedAsset,
  type ProgressDocument,
} from '../folder';
import type {
  AssetTagState,
  TaggingFilterStatus,
  TaggingFilterType,
  TaggingWorkspaceState,
} from './types';

export const MIN_BYSTANDER_COUNT = 0;
export const MAX_BYSTANDER_COUNT = 20;

export const INITIAL_TAGGING_WORKSPACE_STATE: TaggingWorkspaceState = {
  assets: [],
  activeAssetId: null,
  statusFilter: 'all',
  typeFilter: 'all',
  assetSearchQuery: '',
  personSearchQuery: '',
};

export type TaggingAction =
  | {
      type: 'SYNC_ASSETS';
      assets: IngestedAsset[];
      assetHashes?: Record<string, string>;
      resetTags?: boolean;
      progress?: ProgressDocument | null;
    }
  | { type: 'SELECT_ASSET'; assetId: string }
  | { type: 'ADD_PERSON_TAG'; assetId: string; personId: string; isSelectable?: boolean }
  | { type: 'REMOVE_PERSON_TAG'; assetId: string; personId: string }
  | { type: 'SET_BYSTANDER_COUNT'; assetId: string; count: number }
  | { type: 'INCREMENT_BYSTANDER'; assetId: string }
  | { type: 'DECREMENT_BYSTANDER'; assetId: string }
  | { type: 'TOGGLE_NO_PERSON'; assetId: string; value?: boolean }
  | { type: 'MARK_REVIEWED_TO_END'; assetId: string }
  | { type: 'CONFIRM_EXTERNAL_REVIEW'; assetId: string; confirmed: boolean }
  | { type: 'UPDATE_DURATION'; assetId: string; durationSeconds: number }
  | { type: 'APPLY_ASSET_REDACTION'; assetId: string; newSha256: string }
  | { type: 'MARK_ASSETS_DELETED'; assetIds: string[] }
  | { type: 'MARK_ASSETS_HELD_FROM_SAVE'; assetIds: string[] }
  | { type: 'CONFIRM_CHANGED_TAGS'; assetId: string }
  | { type: 'SET_STATUS_FILTER'; filter: TaggingFilterStatus }
  | { type: 'SET_TYPE_FILTER'; filter: TaggingFilterType }
  | { type: 'SET_ASSET_SEARCH_QUERY'; query: string }
  | { type: 'SET_PERSON_SEARCH_QUERY'; query: string }
  | { type: 'CLEAR_FILTERS' };

function createInitialAssetTagState(
  asset: IngestedAsset,
  shaOverride?: string
): AssetTagState {
  return {
    assetId: asset.assetId,
    assetType: asset.assetType,
    capturedAt: asset.capturedAt,
    captureTimeSource: asset.captureTimeSource,
    sizeBytes: asset.sizeBytes,
    sha256: shaOverride ?? asset.sha256,
    durationSeconds: asset.durationSeconds,
    personIds: [],
    bystanderCount: 0,
    noPerson: false,
    reviewedToEnd: false,
    externalReviewConfirmed: false,
    state: 'active',
  };
}

function updateAssetById(
  assets: AssetTagState[],
  assetId: string,
  updater: (asset: AssetTagState) => AssetTagState
): AssetTagState[] {
  let changed = false;
  const next = assets.map((item) => {
    if (item.assetId !== assetId) {
      return item;
    }
    const updated = updater(item);
    if (updated !== item) {
      changed = true;
    }
    return updated;
  });
  return changed ? next : assets;
}

export function clampBystanderCount(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_BYSTANDER_COUNT;
  }
  return Math.max(MIN_BYSTANDER_COUNT, Math.min(MAX_BYSTANDER_COUNT, Math.floor(value)));
}

function buildReconciledAssets(
  diskAssets: IngestedAsset[],
  progress: ProgressDocument,
  assetHashes?: Record<string, string>
): AssetTagState[] {
  const reconciled = reconcileFolderWithProgress(diskAssets, progress, assetHashes);

  return reconciled.items.map((item): AssetTagState => {
    const disk = item.diskAsset;
    const prog = item.progressEntry;

    if (disk && prog) {
      const sha = assetHashes?.[item.assetId] ?? disk.sha256 ?? prog.sha256 ?? undefined;
      return {
        assetId: item.assetId,
        assetType: disk.assetType,
        capturedAt: disk.capturedAt,
        captureTimeSource: disk.captureTimeSource,
        sizeBytes: disk.sizeBytes,
        sha256: sha,
        durationSeconds: disk.durationSeconds,
        personIds: [...prog.person_ids],
        bystanderCount: prog.bystander_count,
        noPerson: prog.no_person,
        reviewedToEnd: prog.reviewed_to_end,
        externalReviewConfirmed: prog.external_review_confirmed,
        state: prog.state,
        presenceStatus: item.discrepancy === 'changed' ? 'changed' : 'present',
        isHeldFromSave: item.isHeldFromSave,
        progressSha256: item.progressSha256,
      };
    }

    if (disk && !prog) {
      const sha = assetHashes?.[item.assetId] ?? disk.sha256;
      return {
        ...createInitialAssetTagState(disk, sha),
        presenceStatus: 'untagged',
        isHeldFromSave: false,
        progressSha256: null,
      };
    }

    // Only present in progress file (missing from disk, or intentionally deleted)
    return {
      assetId: item.assetId,
      assetType: prog!.asset_type,
      capturedAt: prog!.captured_at,
      captureTimeSource: fromProgressCaptureSource(prog!.captured_at_source),
      sizeBytes: 0,
      sha256: prog!.sha256 ?? undefined,
      personIds: [...prog!.person_ids],
      bystanderCount: prog!.bystander_count,
      noPerson: prog!.no_person,
      reviewedToEnd: prog!.reviewed_to_end,
      externalReviewConfirmed: prog!.external_review_confirmed,
      state: prog!.state,
      presenceStatus: item.discrepancy === 'deleted' ? 'deleted' : 'missing',
      isHeldFromSave: item.isHeldFromSave,
      progressSha256: item.progressSha256,
    };
  });
}

export function taggingReducer(
  state: TaggingWorkspaceState,
  action: TaggingAction
): TaggingWorkspaceState {
  switch (action.type) {
    case 'SYNC_ASSETS': {
      let nextAssets: AssetTagState[];

      if (action.progress) {
        nextAssets = buildReconciledAssets(
          action.assets,
          action.progress,
          action.assetHashes
        );
      } else {
        const existingMap = new Map<string, AssetTagState>();
        if (!action.resetTags) {
          for (const existing of state.assets) {
            existingMap.set(existing.assetId, existing);
          }
        }

        const seenIds = new Set<string>();
        nextAssets = action.assets.map((ingested) => {
          seenIds.add(ingested.assetId);
          const sha = action.assetHashes?.[ingested.assetId] ?? ingested.sha256;
          const prev = existingMap.get(ingested.assetId);
          if (!prev) {
            return createInitialAssetTagState(ingested, sha);
          }
          const nextSha = sha ?? prev.sha256;
          const nextDuration = prev.durationSeconds ?? ingested.durationSeconds;
          const detectedChanged =
            Boolean(prev.progressSha256) &&
            Boolean(nextSha) &&
            nextSha !== prev.progressSha256;
          const nextPresenceStatus = detectedChanged
            ? 'changed'
            : prev.presenceStatus === 'missing'
              ? 'present'
              : prev.presenceStatus;

          if (
            prev.sha256 === nextSha &&
            prev.durationSeconds === nextDuration &&
            prev.assetType === ingested.assetType &&
            prev.capturedAt === ingested.capturedAt &&
            prev.captureTimeSource === ingested.captureTimeSource &&
            prev.sizeBytes === ingested.sizeBytes &&
            prev.presenceStatus === nextPresenceStatus
          ) {
            return prev;
          }
          return {
            ...prev,
            assetType: ingested.assetType,
            capturedAt: ingested.capturedAt,
            captureTimeSource: ingested.captureTimeSource,
            sizeBytes: ingested.sizeBytes,
            sha256: nextSha,
            durationSeconds: nextDuration,
            presenceStatus: nextPresenceStatus,
          };
        });

        // Retain intentionally deleted or previously reconciled missing entries even when absent on disk
        let appendedSpecial = false;
        if (!action.resetTags) {
          for (const existing of state.assets) {
            if (
              !seenIds.has(existing.assetId) &&
              (existing.state === 'deleted' || existing.presenceStatus === 'missing')
            ) {
              nextAssets.push(existing);
              appendedSpecial = true;
            }
          }
          if (appendedSpecial) {
            nextAssets.sort((a, b) =>
              a.assetId.localeCompare(b.assetId, undefined, {
                numeric: true,
                sensitivity: 'base',
              })
            );
          }
        }
      }

      const activeStillExists =
        !action.resetTags &&
        state.activeAssetId !== null &&
        nextAssets.some((a) => a.assetId === state.activeAssetId);

      const nextActiveAssetId = activeStillExists
        ? state.activeAssetId
        : (nextAssets[0]?.assetId ?? null);

      const arraysIdentical =
        !action.resetTags &&
        nextAssets.length === state.assets.length &&
        nextAssets.every((item, idx) => item === state.assets[idx]);

      if (arraysIdentical && nextActiveAssetId === state.activeAssetId) {
        return state;
      }

      return {
        ...state,
        assets: arraysIdentical ? state.assets : nextAssets,
        activeAssetId: nextActiveAssetId,
        ...(action.resetTags
          ? {
              statusFilter: 'all' as TaggingFilterStatus,
              typeFilter: 'all' as TaggingFilterType,
              assetSearchQuery: '',
              personSearchQuery: '',
            }
          : {}),
      };
    }

    case 'SELECT_ASSET': {
      if (state.activeAssetId === action.assetId) {
        return state;
      }
      if (!state.assets.some((a) => a.assetId === action.assetId)) {
        return state;
      }
      return {
        ...state,
        activeAssetId: action.assetId,
      };
    }

    case 'ADD_PERSON_TAG': {
      if (action.isSelectable === false) {
        return state;
      }
      const nextAssets = updateAssetById(state.assets, action.assetId, (asset) => {
        if (asset.state === 'deleted' || asset.presenceStatus === 'missing') {
          return asset;
        }
        // R-19: No person active blocks person selection
        if (asset.noPerson) {
          return asset;
        }
        // R-14: Duplicate person selection does nothing
        if (asset.personIds.includes(action.personId)) {
          return asset;
        }
        return {
          ...asset,
          personIds: [...asset.personIds, action.personId],
        };
      });
      return nextAssets === state.assets ? state : { ...state, assets: nextAssets };
    }

    case 'REMOVE_PERSON_TAG': {
      const nextAssets = updateAssetById(state.assets, action.assetId, (asset) => {
        if (asset.state === 'deleted' || asset.presenceStatus === 'missing') {
          return asset;
        }
        if (!asset.personIds.includes(action.personId)) {
          return asset;
        }
        return {
          ...asset,
          personIds: asset.personIds.filter((id) => id !== action.personId),
        };
      });
      return nextAssets === state.assets ? state : { ...state, assets: nextAssets };
    }

    case 'SET_BYSTANDER_COUNT': {
      const clamped = clampBystanderCount(action.count);
      const nextAssets = updateAssetById(state.assets, action.assetId, (asset) => {
        // R-19: No person active disables bystander stepper; locked on missing/deleted
        if (asset.noPerson || asset.state === 'deleted' || asset.presenceStatus === 'missing') {
          return asset;
        }
        // R-34: A held asset's bystander count cannot be cleared via workspace controls
        const targetCount = asset.isHeldFromSave ? Math.max(1, clamped) : clamped;
        if (asset.bystanderCount === targetCount) {
          return asset;
        }
        return {
          ...asset,
          bystanderCount: targetCount,
        };
      });
      return nextAssets === state.assets ? state : { ...state, assets: nextAssets };
    }

    case 'INCREMENT_BYSTANDER': {
      const nextAssets = updateAssetById(state.assets, action.assetId, (asset) => {
        if (asset.noPerson || asset.state === 'deleted' || asset.presenceStatus === 'missing') {
          return asset;
        }
        const nextCount = clampBystanderCount(asset.bystanderCount + 1);
        if (nextCount === asset.bystanderCount) {
          return asset;
        }
        return {
          ...asset,
          bystanderCount: nextCount,
        };
      });
      return nextAssets === state.assets ? state : { ...state, assets: nextAssets };
    }

    case 'DECREMENT_BYSTANDER': {
      const nextAssets = updateAssetById(state.assets, action.assetId, (asset) => {
        if (asset.noPerson || asset.state === 'deleted' || asset.presenceStatus === 'missing') {
          return asset;
        }
        // R-34: A held asset's bystander count cannot be cleared below 1 except via R-31 / R-32
        const minCount = asset.isHeldFromSave ? 1 : MIN_BYSTANDER_COUNT;
        const nextCount = Math.max(minCount, clampBystanderCount(asset.bystanderCount - 1));
        if (nextCount === asset.bystanderCount) {
          return asset;
        }
        return {
          ...asset,
          bystanderCount: nextCount,
        };
      });
      return nextAssets === state.assets ? state : { ...state, assets: nextAssets };
    }

    case 'TOGGLE_NO_PERSON': {
      const nextAssets = updateAssetById(state.assets, action.assetId, (asset) => {
        if (asset.state === 'deleted' || asset.presenceStatus === 'missing') {
          return asset;
        }
        const nextValue = action.value !== undefined ? action.value : !asset.noPerson;
        if (nextValue === asset.noPerson) {
          return asset;
        }
        // R-19: Cannot turn on "No person" while people are selected or bystanders counted
        if (nextValue && (asset.personIds.length > 0 || asset.bystanderCount > 0)) {
          return asset;
        }
        return {
          ...asset,
          noPerson: nextValue,
        };
      });
      return nextAssets === state.assets ? state : { ...state, assets: nextAssets };
    }

    case 'MARK_REVIEWED_TO_END': {
      const nextAssets = updateAssetById(state.assets, action.assetId, (asset) => {
        if (asset.reviewedToEnd) {
          return asset;
        }
        return {
          ...asset,
          reviewedToEnd: true,
        };
      });
      return nextAssets === state.assets ? state : { ...state, assets: nextAssets };
    }

    case 'CONFIRM_EXTERNAL_REVIEW': {
      const nextAssets = updateAssetById(state.assets, action.assetId, (asset) => {
        if (asset.externalReviewConfirmed === action.confirmed) {
          return asset;
        }
        return {
          ...asset,
          externalReviewConfirmed: action.confirmed,
        };
      });
      return nextAssets === state.assets ? state : { ...state, assets: nextAssets };
    }

    case 'UPDATE_DURATION': {
      if (!Number.isFinite(action.durationSeconds) || action.durationSeconds < 0) {
        return state;
      }
      const nextAssets = updateAssetById(state.assets, action.assetId, (asset) => {
        if (asset.durationSeconds === action.durationSeconds) {
          return asset;
        }
        return {
          ...asset,
          durationSeconds: action.durationSeconds,
        };
      });
      return nextAssets === state.assets ? state : { ...state, assets: nextAssets };
    }

    case 'APPLY_ASSET_REDACTION': {
      const nextAssets = updateAssetById(state.assets, action.assetId, (asset) => ({
        ...asset,
        sha256: action.newSha256,
        progressSha256: action.newSha256,
        bystanderCount: 0,
        isHeldFromSave: false,
        presenceStatus: 'present',
        state: 'active',
      }));
      return nextAssets === state.assets ? state : { ...state, assets: nextAssets };
    }

    case 'MARK_ASSETS_DELETED': {
      const targetSet = new Set(action.assetIds);
      if (targetSet.size === 0) {
        return state;
      }
      let changed = false;
      const nextAssets = state.assets.map((asset) => {
        if (!targetSet.has(asset.assetId)) {
          return asset;
        }
        changed = true;
        return {
          ...asset,
          bystanderCount: 0,
          isHeldFromSave: false,
          state: 'deleted' as const,
          presenceStatus: 'deleted' as const,
        };
      });
      return changed ? { ...state, assets: nextAssets } : state;
    }

    case 'MARK_ASSETS_HELD_FROM_SAVE': {
      const heldSet = new Set(action.assetIds);
      if (heldSet.size === 0) {
        return state;
      }
      let changed = false;
      const nextAssets = state.assets.map((asset) => {
        if (!heldSet.has(asset.assetId)) {
          return asset;
        }
        const nextBaseline = asset.sha256 ?? asset.progressSha256 ?? null;
        if (asset.isHeldFromSave && asset.progressSha256 === nextBaseline) {
          return asset;
        }
        changed = true;
        return {
          ...asset,
          isHeldFromSave: true,
          progressSha256: nextBaseline,
        };
      });
      return changed ? { ...state, assets: nextAssets } : state;
    }

    case 'CONFIRM_CHANGED_TAGS': {
      const nextAssets = updateAssetById(state.assets, action.assetId, (asset) => {
        // R-34: A held asset with bystanders cannot skip redaction via check-tags confirmation
        if (asset.isHeldFromSave || asset.presenceStatus !== 'changed') {
          return asset;
        }
        return {
          ...asset,
          presenceStatus: 'present',
          progressSha256: asset.sha256 ?? null,
        };
      });
      return nextAssets === state.assets ? state : { ...state, assets: nextAssets };
    }

    case 'SET_STATUS_FILTER':
      return { ...state, statusFilter: action.filter };

    case 'SET_TYPE_FILTER':
      return { ...state, typeFilter: action.filter };

    case 'SET_ASSET_SEARCH_QUERY':
      return { ...state, assetSearchQuery: action.query };

    case 'SET_PERSON_SEARCH_QUERY':
      return { ...state, personSearchQuery: action.query };

    case 'CLEAR_FILTERS':
      return {
        ...state,
        statusFilter: 'all',
        typeFilter: 'all',
        assetSearchQuery: '',
      };
  }
}
