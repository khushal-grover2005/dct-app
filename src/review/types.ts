import type { AssetType } from '../folder';
import type { ExportCsvRow } from '../validation';

export interface ExportSheetBuildResult {
  exportId: string;
  exportedAt: string;
  collectionRef: string;
  fileName: string;
  csvText: string;
  rows: ExportCsvRow[];
  heldAssets: string[];
  missingHashAssets: string[];
  fileDateAssets: string[];
}

export interface FilenamePiiWarning {
  assetId: string;
  message: string;
}

export interface ReviewErrorItem {
  key: string;
  code: string;
  message: string;
  assetId?: string;
  line?: number;
  source: 'validator' | 'readiness';
}

export interface ReviewSummaryMetrics {
  totalAssets: number;
  deletedAssets: number;
  exportRowCount: number;
  personTagRows: number;
  uniquePeopleTagged: number;
  heldAssetsCount: number;
  notDoneAssetsCount: number;
  unhashedAssetsCount: number;
  countsByType: Record<AssetType, number>;
}

export interface SaveSheetResult {
  saved: boolean;
  fileName: string;
  exportId: string;
  savedAt: string;
  csvText: string;
  heldAssets: string[];
  error?: string;
}

export interface ReviewCandidate {
  sheet: ExportSheetBuildResult;
  errors: ReviewErrorItem[];
  warnings: ReviewErrorItem[];
  metrics: ReviewSummaryMetrics;
  canSave: boolean;
  canDownload: boolean;
  filenameWarnings: FilenamePiiWarning[];
  saveSheet: () => Promise<SaveSheetResult>;
  downloadCopy: () => boolean;
  isSaving: boolean;
  saveError: string | null;
  lastSaved: SaveSheetResult | null;
}
