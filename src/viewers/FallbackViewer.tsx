import React from 'react';
import {
  FileImage,
  FileVideo,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileQuestion,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import type { AssetType } from '../folder';
import type { AssetTagState } from '../tagging/types';
import { isMediaReviewType } from '../tagging/selectors';
import { formatBytes } from './mimeTypes';

export interface ViewerKeyboardActions {
  togglePlayPause?: () => void;
  zoomIn?: () => void;
  zoomOut?: () => void;
  zoomReset?: () => void;
}

interface FallbackViewerProps {
  asset: AssetTagState;
  reason?: string;
  onConfirmExternalReview?: (confirmed: boolean) => void;
}

function getAssetTypeIcon(assetType: AssetType): React.ReactNode {
  const props = { className: 'w-14 h-14 text-slate-400' };
  switch (assetType) {
    case 'image':
      return <FileImage {...props} />;
    case 'video':
      return <FileVideo {...props} />;
    case 'audio':
      return <FileAudio {...props} />;
    case 'sensor':
      return <FileSpreadsheet {...props} />;
    case 'document':
      return <FileText {...props} />;
    default:
      return <FileQuestion {...props} />;
  }
}

export const FallbackViewer: React.FC<FallbackViewerProps> = ({
  asset,
  reason,
  onConfirmExternalReview,
}) => {
  const requiresExternalMediaConfirm = isMediaReviewType(asset.assetType);

  return (
    <div
      data-testid="fallback-viewer"
      className="flex flex-col items-center justify-center h-full min-h-[360px] p-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300 text-center"
    >
      <div className="p-4 rounded-full bg-white border border-slate-200 shadow-sm mb-4">
        {getAssetTypeIcon(asset.assetType)}
      </div>

      <h3 className="text-base font-semibold text-slate-900 font-mono break-all max-w-lg">
        {asset.assetId}
      </h3>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-600">
        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-medium">
          {asset.assetType}
        </span>
        <span>Size: {formatBytes(asset.sizeBytes)}</span>
        <span>•</span>
        <span className="font-mono">Captured: {asset.capturedAt}</span>
      </div>

      <div className="mt-5 max-w-md bg-white border border-slate-200 rounded-md p-4 shadow-sm text-xs text-slate-700 space-y-2">
        <div className="flex items-center justify-center space-x-1.5 font-medium text-slate-800">
          <ExternalLink className="w-4 h-4 text-slate-500" />
          <span>No browser preview available</span>
        </div>
        {reason && <p className="text-slate-500">{reason}</p>}
        <p data-testid="fallback-guidance-text" className="text-slate-700">
          No preview in app — view this file in your usual viewer, then tag it here.
        </p>
      </div>

      {requiresExternalMediaConfirm && onConfirmExternalReview && (
        <div className="mt-5">
          {asset.externalReviewConfirmed ? (
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span data-testid="external-review-confirmed-badge">
                Confirmed reviewed outside the app
              </span>
              <button
                type="button"
                onClick={() => onConfirmExternalReview(false)}
                className="ml-2 underline text-emerald-700 hover:text-emerald-900"
              >
                Undo
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="confirm-external-review-btn"
              onClick={() => onConfirmExternalReview(true)}
              className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 shadow-sm transition"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              I reviewed it outside the app
            </button>
          )}
        </div>
      )}
    </div>
  );
};
