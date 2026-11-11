import type { AssetType } from '../folder';
import type {
  AssetStatusInfo,
  AssetTagState,
  PeoplePanelPrompt,
  TaggingFilterStatus,
  TaggingFilterType,
  WorkspaceStats,
} from './types';

export function isMediaReviewType(assetType: AssetType): boolean {
  return assetType === 'video' || assetType === 'audio';
}

export function isMediaReviewSatisfied(asset: AssetTagState): boolean {
  if (!isMediaReviewType(asset.assetType)) {
    return true;
  }
  return asset.reviewedToEnd || asset.externalReviewConfirmed;
}

export function isBystanderOnly(asset: AssetTagState): boolean {
  return asset.personIds.length === 0 && asset.bystanderCount > 0 && !asset.noPerson;
}

export function isAssetDone(asset: AssetTagState): boolean {
  if (asset.state === 'deleted') {
    return true;
  }
  if (isBystanderOnly(asset)) {
    return false;
  }
  const hasValidTagDecision = asset.personIds.length > 0 || asset.noPerson;
  if (!hasValidTagDecision) {
    return false;
  }
  return isMediaReviewSatisfied(asset);
}

export function getAssetStatusInfo(asset: AssetTagState): AssetStatusInfo {
  const hasBystanders = asset.bystanderCount > 0;
  const done = isAssetDone(asset);

  if (isBystanderOnly(asset)) {
    return {
      primaryStatus: 'bystander_only',
      label: 'bystander only — delete this file',
      variant: 'error',
      isDone: false,
      hasBystanders: true,
    };
  }

  if (isMediaReviewType(asset.assetType) && !isMediaReviewSatisfied(asset)) {
    return {
      primaryStatus: 'not_fully_reviewed',
      label: 'not fully reviewed',
      variant: 'warning',
      isDone: false,
      hasBystanders,
    };
  }

  if (asset.personIds.length > 0) {
    return {
      primaryStatus: 'tagged',
      label: `tagged (${asset.personIds.length})`,
      variant: hasBystanders ? 'warning' : 'done',
      isDone: done,
      hasBystanders,
    };
  }

  if (asset.noPerson) {
    return {
      primaryStatus: 'no_person',
      label: 'no person',
      variant: 'done',
      isDone: done,
      hasBystanders: false,
    };
  }

  return {
    primaryStatus: 'untagged',
    label: 'untagged',
    variant: 'neutral',
    isDone: false,
    hasBystanders: false,
  };
}

export function matchesStatusFilter(
  asset: AssetTagState,
  statusFilter: TaggingFilterStatus
): boolean {
  switch (statusFilter) {
    case 'all':
      return true;
    case 'not_done':
      return !isAssetDone(asset);
    case 'untagged':
      return asset.personIds.length === 0 && asset.bystanderCount === 0 && !asset.noPerson;
    case 'tagged':
      return asset.personIds.length > 0;
    case 'bystanders':
      return asset.bystanderCount > 0;
    case 'bystander_only':
      return isBystanderOnly(asset);
    case 'no_person':
      return asset.noPerson;
  }
}

export function filterWorkspaceAssets(
  assets: AssetTagState[],
  statusFilter: TaggingFilterStatus,
  typeFilter: TaggingFilterType,
  searchQuery: string
): AssetTagState[] {
  const q = searchQuery.trim().toLowerCase();

  return assets.filter((asset) => {
    if (typeFilter !== 'all' && asset.assetType !== typeFilter) {
      return false;
    }
    if (!matchesStatusFilter(asset, statusFilter)) {
      return false;
    }
    if (q && !asset.assetId.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}

export function computeWorkspaceStats(assets: AssetTagState[]): WorkspaceStats {
  let doneCount = 0;
  let untaggedCount = 0;
  let taggedCount = 0;
  let noPersonCount = 0;
  let bystanderCount = 0;
  let bystanderOnlyCount = 0;
  let notReviewedCount = 0;

  for (const asset of assets) {
    if (isAssetDone(asset)) {
      doneCount++;
    }
    if (isMediaReviewType(asset.assetType) && !isMediaReviewSatisfied(asset)) {
      notReviewedCount++;
    }
    if (isBystanderOnly(asset)) {
      bystanderOnlyCount++;
    }
    if (asset.bystanderCount > 0) {
      bystanderCount++;
    }
    if (asset.personIds.length > 0) {
      taggedCount++;
    } else if (asset.noPerson) {
      noPersonCount++;
    } else if (asset.bystanderCount === 0) {
      untaggedCount++;
    }
  }

  return {
    totalCount: assets.length,
    doneCount,
    untaggedCount,
    taggedCount,
    noPersonCount,
    bystanderCount,
    bystanderOnlyCount,
    notReviewedCount,
  };
}

export function getPeoplePanelPrompt(assetType: AssetType): PeoplePanelPrompt {
  switch (assetType) {
    case 'image':
      return {
        heading: 'People visible in this image',
        bystanderHint:
          'Count as a bystander anyone visible who is not on the list or cannot be identified.',
      };
    case 'video':
      return {
        heading: 'People visible or heard in this video',
        bystanderHint:
          'Count as a bystander anyone visible or heard at any point who is not on the list.',
      };
    case 'audio':
      return {
        heading: 'People heard in this recording',
        bystanderHint:
          'Count as a bystander anyone heard in this recording who is not on the list or cannot be identified.',
      };
    case 'sensor':
      return {
        heading: 'People who wore or were measured by the device',
        bystanderHint:
          'Sensors typically record one person; use "No person in this asset" for environmental sensors.',
      };
    case 'document':
      return {
        heading: 'People named, pictured, or identifiable in this document',
        bystanderHint:
          'Count as a bystander anyone identifiable in this document who is not on the list.',
      };
    case 'other':
      return {
        heading: 'People in this file in any identifiable way',
        bystanderHint:
          'Count as a bystander anyone identifiable in this file who is not on the list.',
      };
  }
}
