import type {
  IngestedAsset,
  AggregateProgress,
  CustomTypeMap,
  ProgressDocument,
  ProgressReconciliationResult,
  ProgressSaveEntry,
  ListDeletionReminderStatus,
} from '../folder';
import type { ConsentedListResult, ListValidationError } from '../list';

export interface FolderUiState {
  directoryHandle: FileSystemDirectoryHandle | null;
  folderName: string | null;
  assets: IngestedAsset[];
  isScanning: boolean;
  scanWarnings: string[];
  customTypeMap?: CustomTypeMap;
  aggregateProgress: AggregateProgress | null;
  isHashingComplete: boolean;
  hashingError?: string | null;
}

export interface ListUiState {
  listFile: File | null;
  listResult: ConsentedListResult | null;
  listErrors: ListValidationError[] | null;
  isLoading: boolean;
}

export interface AppPipeline {
  // Folder state
  directoryHandle: FileSystemDirectoryHandle | null;
  folderName: string | null;
  assets: IngestedAsset[];
  folderScanning: boolean;
  folderWarnings: string[];
  collectionRef: string;
  setCollectionRef: (ref: string) => void;

  // Resume / Progress state (UC-05, R-09, R-22..R-24, R-37)
  detectedProgress: ProgressDocument | null;
  progressReadError: string | null;
  reconciliation: ProgressReconciliationResult | null;
  listDeletionReminder: ListDeletionReminderStatus;

  // Hashing state
  hashingProgress: AggregateProgress;
  hashingCompleted: boolean;
  assetHashes: Record<string, string>;

  // List state
  consentedList: ConsentedListResult | null;
  listLoading: boolean;
  listErrors: ListValidationError[];
  listFileName: string | null;

  // Pipeline actions
  openFolder: () => Promise<void>;
  openFolderFromHandle: (handle: FileSystemDirectoryHandle) => Promise<void>;
  loadListFromFile: (file: File) => Promise<void>;
  loadListFromText: (csvText: string, fileName?: string) => void;
  markFilesDeleted: (assetIds: string[]) => void;
  updateRedactedAssetFile: (assetId: string, file: File, newSha256: string) => void;
  resetAll: () => void;

  // Derived readiness
  isReadyForTagging: boolean;
}

export interface StartScreenProps {
  pipeline: AppPipeline;
  savedEntries?: ProgressSaveEntry[];
  onProceed?: () => void;
  onGoToCorrections?: () => void;
}
