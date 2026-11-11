import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import type { AssetTagState } from '../tagging/types';
import { createTypedBlobUrl, safeRevokeBlobUrl, formatBytes } from './mimeTypes';

interface DocumentViewerProps {
  asset: AssetTagState;
  file: File;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ asset, file }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = createTypedBlobUrl(file, asset.assetId);
    setBlobUrl(url);
    return () => {
      safeRevokeBlobUrl(url);
    };
  }, [asset.assetId, file]);

  return (
    <div
      data-testid="document-viewer"
      className="flex flex-col h-full min-h-[420px] bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm"
    >
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-indigo-600" />
          <span className="font-semibold text-slate-800">PDF Document Viewer</span>
        </div>
        <span className="text-slate-500 font-mono">{formatBytes(asset.sizeBytes)}</span>
      </div>

      {blobUrl ? (
        <iframe
          data-testid="pdf-viewer-frame"
          src={blobUrl}
          title={asset.assetId}
          className="w-full flex-1 min-h-[400px] border-0 bg-slate-100"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
          Preparing PDF preview...
        </div>
      )}
    </div>
  );
};
