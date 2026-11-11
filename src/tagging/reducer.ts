import type { IngestedAsset } from '../folder';
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

export function taggingReducer(
  state: TaggingWorkspaceState,
  action: TaggingAction
): TaggingWorkspaceState {
  switch (action.type) {
    case 'SYNC_ASSETS': {
      const existingMap = new Map<string, AssetTagState>();
      if (!action.resetTags) {
        for (const existing of state.assets) {
          existingMap.set(existing.assetId, existing);
        }
      }

      const nextAssets: AssetTagState[] = action.assets.map((ingested) => {
        const sha = action.assetHashes?.[ingested.assetId] ?? ingested.sha256;
        const prev = existingMap.get(ingested.assetId);
        if (!prev) {
          return createInitialAssetTagState(ingested, sha);
        }
        const nextSha = sha ?? prev.sha256;
        const nextDuration = prev.durationSeconds ?? ingested.durationSeconds;
        if (
          prev.sha256 === nextSha &&
          prev.durationSeconds === nextDuration &&
          prev.assetType === ingested.assetType &&
          prev.capturedAt === ingested.capturedAt &&
          prev.captureTimeSource === ingested.captureTimeSource &&
          prev.sizeBytes === ingested.sizeBytes
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
        };
      });

      const activeStillExists =
        !action.resetTags &&
        state.activeAssetId !== null &&
        nextAssets.some((a) => a.assetId === state.activeAssetId);

      const nextActiveAssetId = activeStillExists
        ? state.activeAssetId
        : (nextAssets[0]?.assetId ?? null);

      return {
        ...state,
        assets: nextAssets,
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
        // R-19: No person active disables bystander stepper
        if (asset.noPerson || asset.bystanderCount === clamped) {
          return asset;
        }
        return {
          ...asset,
          bystanderCount: clamped,
        };
      });
      return nextAssets === state.assets ? state : { ...state, assets: nextAssets };
    }

    case 'INCREMENT_BYSTANDER': {
      const nextAssets = updateAssetById(state.assets, action.assetId, (asset) => {
        if (asset.noPerson) {
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
        if (asset.noPerson) {
          return asset;
        }
        const nextCount = clampBystanderCount(asset.bystanderCount - 1);
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
