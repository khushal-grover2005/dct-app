import React, { useState, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { hasNativePreview, type AssetType, type CaptureTimeSource } from '../folder';
import type { AssetTagState } from '../tagging/types';
import { formatBytes, formatDurationSeconds } from './mimeTypes';
import { ImageViewer } from './ImageViewer';
import { VideoViewer } from './VideoViewer';
import { AudioViewer } from './AudioViewer';
import { SensorViewer } from './SensorViewer';
import { DocumentViewer } from './DocumentViewer';
import { FallbackViewer, type ViewerKeyboardActions } from './FallbackViewer';

interface CenterViewerPaneProps {
  asset: AssetTagState | null;
  file: File | null;
  activeIndex: number;
  totalFilteredCount: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReviewedToEnd: (assetId: string) => void;
  onConfirmExternalReview: (assetId: string, confirmed: boolean) => void;
  onDurationKnown: (assetId: string, durationSeconds: number) => void;
  actionsRef: React.MutableRefObject<ViewerKeyboardActions | null>;
}

const SOURCE_LABELS: Record<CaptureTimeSource, { label: string; className: string }> = {
  exif: { label: 'EXIF', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  mp4box: { label: 'MP4 header', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  last_modified: {
    label: 'capture time from file date',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
};

const TYPE_STYLES: Record<AssetType, string> = {
  image: 'bg-sky-50 text-sky-700 border-sky-200',
  video: 'bg-purple-50 text-purple-700 border-purple-200',
  audio: 'bg-amber-50 text-amber-700 border-amber-200',
  sensor: 'bg-teal-50 text-teal-700 border-teal-200',
  document: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  other: 'bg-slate-100 text-slate-700 border-slate-300',
};

export const CenterViewerPane: React.FC<CenterViewerPaneProps> = ({
  asset,
  file,
  activeIndex,
  totalFilteredCount,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onReviewedToEnd,
  onConfirmExternalReview,
  onDurationKnown,
  actionsRef,
}) => {
  // Tracks assets whose file content failed browser media/image decoding (e.g., MKV renamed to .mp4)
  const [decodeFailedIds, setDecodeFailedIds] = useState<Record<string, boolean>>({});

  // Clear viewer actions ref when active asset switches to non-interactive viewer
  useEffect(() => {
    return () => {
      actionsRef.current = null;
    };
  }, [asset?.assetId, actionsRef]);

  const handleLoadFailed = useCallback((assetId: string) => {
    setDecodeFailedIds((prev) => {
      if (prev[assetId]) return prev;
      return { ...prev, [assetId]: true };
    });
  }, []);

  if (!asset || !file) {
    return (
      <section
        data-testid="center-viewer-pane"
        className="flex-1 flex items-center justify-center p-8 bg-slate-100"
      >
        <div className="text-center text-sm text-slate-500">
          Select an asset from the list to inspect and tag.
        </div>
      </section>
    );
  }

  const sourceMeta = SOURCE_LABELS[asset.captureTimeSource];
  const isNativeSupported = hasNativePreview(asset.assetType, asset.assetId);
  const decodeFailed = Boolean(decodeFailedIds[asset.assetId]);

  const renderViewer = () => {
    if (decodeFailed) {
      return (
        <FallbackViewer
          asset={asset}
          reason="The browser could not decode this file format or codec."
          onConfirmExternalReview={(confirmed) =>
            onConfirmExternalReview(asset.assetId, confirmed)
          }
        />
      );
    }

    switch (asset.assetType) {
      case 'image':
        return isNativeSupported ? (
          <ImageViewer
            asset={asset}
            file={file}
            onLoadFailed={() => handleLoadFailed(asset.assetId)}
            actionsRef={actionsRef}
          />
        ) : (
          <FallbackViewer
            asset={asset}
            reason="Non-browser image format."
          />
        );

      case 'video':
        return isNativeSupported ? (
          <VideoViewer
            asset={asset}
            file={file}
            onReviewedToEnd={() => onReviewedToEnd(asset.assetId)}
            onConfirmExternalReview={(confirmed) =>
              onConfirmExternalReview(asset.assetId, confirmed)
            }
            onDurationKnown={(sec) => onDurationKnown(asset.assetId, sec)}
            onLoadFailed={() => handleLoadFailed(asset.assetId)}
            actionsRef={actionsRef}
          />
        ) : (
          <FallbackViewer
            asset={asset}
            reason="Video format requires external review."
            onConfirmExternalReview={(confirmed) =>
              onConfirmExternalReview(asset.assetId, confirmed)
            }
          />
        );

      case 'audio':
        return isNativeSupported ? (
          <AudioViewer
            asset={asset}
            file={file}
            onReviewedToEnd={() => onReviewedToEnd(asset.assetId)}
            onConfirmExternalReview={(confirmed) =>
              onConfirmExternalReview(asset.assetId, confirmed)
            }
            onDurationKnown={(sec) => onDurationKnown(asset.assetId, sec)}
            onLoadFailed={() => handleLoadFailed(asset.assetId)}
            actionsRef={actionsRef}
          />
        ) : (
          <FallbackViewer
            asset={asset}
            reason="Audio format requires external review."
            onConfirmExternalReview={(confirmed) =>
              onConfirmExternalReview(asset.assetId, confirmed)
            }
          />
        );

      case 'sensor':
        return <SensorViewer asset={asset} file={file} />;

      case 'document':
        return isNativeSupported ? (
          <DocumentViewer asset={asset} file={file} />
        ) : (
          <FallbackViewer
            asset={asset}
            reason="Document format cannot be rendered natively in browser."
          />
        );

      case 'other':
      default:
        return (
          <FallbackViewer
            asset={asset}
            reason="Unrecognized file type."
          />
        );
    }
  };

  return (
    <section
      data-testid="center-viewer-pane"
      className="flex-1 flex flex-col min-w-0 bg-slate-100 p-4 overflow-hidden"
    >
      {/* Metadata & Prev/Next Header */}
      <div
        data-testid="center-viewer-header"
        className="bg-white rounded-lg border border-slate-200 px-4 py-3 mb-3 shadow-sm flex flex-wrap items-center justify-between gap-3"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center space-x-2">
            <h2
              data-testid="viewer-asset-id"
              className="text-sm font-mono font-semibold text-slate-900 truncate"
              title={asset.assetId}
            >
              {asset.assetId}
            </h2>
            <span
              data-testid="viewer-asset-type"
              className={`px-2 py-0.5 rounded text-[11px] font-medium border ${TYPE_STYLES[asset.assetType]}`}
            >
              {asset.assetType}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span data-testid="viewer-captured-at" className="font-mono text-slate-800">
              {asset.capturedAt}
            </span>
            <span
              data-testid="viewer-capture-source"
              className={`px-2 py-0.5 rounded text-[11px] font-medium border ${sourceMeta.className}`}
            >
              {sourceMeta.label}
            </span>
            <span>•</span>
            <span data-testid="viewer-size">{formatBytes(asset.sizeBytes)}</span>
            {asset.durationSeconds !== undefined && (
              <>
                <span>•</span>
                <span data-testid="viewer-duration" className="font-mono">
                  {formatDurationSeconds(asset.durationSeconds)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Navigation controls */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          <span className="text-xs font-mono text-slate-500 mr-1">
            {activeIndex >= 0 ? activeIndex + 1 : 0} / {totalFilteredCount}
          </span>
          <button
            type="button"
            data-testid="prev-asset-btn"
            onClick={onPrev}
            disabled={!hasPrev}
            title="Previous asset (←)"
            aria-label="Previous asset"
            className="inline-flex items-center px-2.5 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev</span>
          </button>
          <button
            type="button"
            data-testid="next-asset-btn"
            onClick={onNext}
            disabled={!hasNext}
            title="Next asset (→)"
            aria-label="Next asset"
            className="inline-flex items-center px-2.5 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Viewer Canvas */}
      <div className="flex-1 min-h-0 flex flex-col">{renderViewer()}</div>
    </section>
  );
};
