import type { AssetType, CaptureTimeSource } from '../folder';

export type TaggingFilterStatus =
  | 'all'
  | 'not_done'
  | 'untagged'
  | 'tagged'
  | 'bystanders'
  | 'bystander_only'
  | 'no_person'
  | 'missing'
  | 'changed'
  | 'deleted';

export type TaggingFilterType = 'all' | AssetType;

export type AssetStatusVariant = 'neutral' | 'done' | 'warning' | 'error';

export type AssetPrimaryStatus =
  | 'untagged'
  | 'tagged'
  | 'no_person'
  | 'bystander_only'
  | 'not_fully_reviewed'
  | 'missing'
  | 'changed'
  | 'deleted';

export type AssetPresenceStatus =
  | 'present'
  | 'missing'
  | 'changed'
  | 'untagged'
  | 'deleted';

export interface AssetTagState {
  assetId: string;
  assetType: AssetType;
  capturedAt: string; // ISO 8601 UTC string ending in 'Z'
  captureTimeSource: CaptureTimeSource;
  sizeBytes: number;
  sha256?: string;
  durationSeconds?: number;
  personIds: string[]; // Selected person_ids in selection order; never typed
  bystanderCount: number; // 0..20
  noPerson: boolean;
  reviewedToEnd: boolean; // Audio/Video played through end
  externalReviewConfirmed: boolean; // Confirmed reviewed outside app
  state: 'active' | 'deleted';
  /** Lifecycle / reconciliation status compared against `.dct-progress.json` */
  presenceStatus?: AssetPresenceStatus;
  /** True once exported/saved with bystander rows and not yet redacted or deleted (R-34) */
  isHeldFromSave?: boolean;
  /** SHA-256 recorded in `.dct-progress.json` before external changes/redactions */
  progressSha256?: string | null;
}

export interface TaggingWorkspaceState {
  assets: AssetTagState[];
  activeAssetId: string | null;
  statusFilter: TaggingFilterStatus;
  typeFilter: TaggingFilterType;
  assetSearchQuery: string;
  personSearchQuery: string;
}

export interface AssetStatusInfo {
  primaryStatus: AssetPrimaryStatus;
  label: string;
  variant: AssetStatusVariant;
  isDone: boolean;
  hasBystanders: boolean;
}

export interface WorkspaceStats {
  totalCount: number;
  doneCount: number;
  untaggedCount: number;
  taggedCount: number;
  noPersonCount: number;
  bystanderCount: number;
  bystanderOnlyCount: number;
  notReviewedCount: number;
  missingCount: number;
  changedCount: number;
  deletedCount: number;
}

export interface PeoplePanelPrompt {
  heading: string;
  bystanderHint: string;
}
