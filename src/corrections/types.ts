import type { AssetType } from '../folder';
import type { ValidationFinding } from '../validation';

export type HeldCorrectionOutcome = 'pending' | 'redacted' | 'deleted';

export interface HeldAssetCardItem {
  assetId: string;
  assetType: AssetType;
  capturedAt: string;
  sha256?: string;
  baselineSha256: string | null;
  personIds: string[];
  bystanderCount: number;
  outcome: HeldCorrectionOutcome;
  errorMessage?: string;
}

export interface DeletionRequestCheckResult {
  requestedIds: string[];
  foundIds: string[];
  notFoundIds: string[];
}

export interface CorrectionSheetPreview {
  fileName: string;
  exportId: string;
  exportedAt: string;
  collectionRef: string;
  csvText: string;
  rowCount: number;
  correctedCount: number;
  deletedCount: number;
  valid: boolean;
  errors: ValidationFinding[];
  warnings: ValidationFinding[];
}

export interface SaveCorrectionSheetResult {
  saved: boolean;
  fileName: string;
  exportId: string;
  savedAt: string;
  csvText: string;
  rowCount: number;
  error?: string;
}
