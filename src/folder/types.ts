export type AssetType = 'image' | 'video' | 'audio' | 'sensor' | 'document' | 'other';

export type CustomTypeMap = Record<string, AssetType>;

export interface CustomTypesFile {
  image?: string[];
  video?: string[];
  audio?: string[];
  sensor?: string[];
  document?: string[];
  other?: string[];
}

export type CaptureTimeSource = 'exif' | 'mp4box' | 'last_modified';

export interface IngestedAsset {
  assetId: string; // normalized path relative to folder with '/' (e.g., "IMG-0001.png", "sub/x.png")
  file: File; // raw File instance
  handle: FileSystemFileHandle; // handle for persistent operations or future reads
  assetType: AssetType; // classified 6-type enum
  sizeBytes: number; // file size in bytes
  sha256?: string; // populated by background worker
  hashProgress?: number; // 0 to 100%
  capturedAt: string; // ISO 8601 UTC string ending in 'Z' (e.g. "2026-11-04T06:02:11Z")
  captureTimeSource: CaptureTimeSource;
  durationSeconds?: number;
}

export interface FolderScanResult {
  folderName: string;
  assets: IngestedAsset[];
  warnings: string[];
  customTypeMap?: CustomTypeMap;
}

export interface CaptureTimeResult {
  capturedAt: string;
  source: CaptureTimeSource;
  durationSeconds?: number;
}

export type CaptureTimeExtractor = (
  file: File,
  assetType: AssetType,
  timezone?: string
) => Promise<CaptureTimeResult>;

export interface FolderScanOptions {
  customTypeMap?: CustomTypeMap;
  captureTimeExtractor?: CaptureTimeExtractor;
  timezone?: string;
}

// Worker message protocol types
export type WorkerInboundMessage =
  | {
      type: 'HASH_FILE';
      jobId: string;
      assetId: string;
      file: File | Blob;
      chunkSizeBytes?: number;
    }
  | {
      type: 'CANCEL';
      jobId: string;
    };

export type WorkerOutboundMessage =
  | {
      type: 'PROGRESS';
      jobId: string;
      assetId: string;
      bytesProcessed: number;
      totalBytes: number;
      percent: number;
    }
  | {
      type: 'DONE';
      jobId: string;
      assetId: string;
      sha256: string;
      totalBytes: number;
      durationMs: number;
    }
  | {
      type: 'ERROR';
      jobId: string;
      assetId: string;
      error: string;
    }
  | {
      type: 'CANCELLED';
      jobId: string;
      assetId: string;
    };

export interface HashJob {
  jobId: string;
  assetId: string;
  file: File;
  onProgress?: (progress: { bytesProcessed: number; totalBytes: number; percent: number }) => void;
  onDone: (result: { sha256: string; durationMs: number }) => void;
  onError: (error: Error) => void;
  onCancelled?: () => void;
}

export interface AggregateProgress {
  totalAssets: number;
  completedAssets: number;
  totalBytes: number;
  processedBytes: number;
  overallPercent: number;
}
