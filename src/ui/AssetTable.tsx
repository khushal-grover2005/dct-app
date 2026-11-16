import React, { useState } from 'react';
import type { IngestedAsset, AssetType, CaptureTimeSource } from '../folder';

const INITIAL_RENDER_CAP = 100;

interface AssetTableProps {
  assets: IngestedAsset[];
  assetHashes?: Record<string, string>;
}

const TYPE_BADGES: Record<AssetType, string> = {
  image: 'bg-sky-50 text-sky-700 border-sky-200',
  video: 'bg-purple-50 text-purple-700 border-purple-200',
  audio: 'bg-amber-50 text-amber-700 border-amber-200',
  sensor: 'bg-teal-50 text-teal-700 border-teal-200',
  document: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  other: 'bg-slate-100 text-slate-700 border-slate-300',
};

const SOURCE_BADGES: Record<CaptureTimeSource, { label: string; className: string }> = {
  exif: { label: 'EXIF', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  mp4box: { label: 'MP4 header', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  last_modified: { label: 'capture time from file date', className: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AssetTable: React.FC<AssetTableProps> = ({ assets, assetHashes = {} }) => {
  const [showAllRows, setShowAllRows] = useState(false);

  if (assets.length === 0) {
    return null;
  }

  const isTruncated = !showAllRows && assets.length > INITIAL_RENDER_CAP;
  const visibleAssets = isTruncated ? assets.slice(0, INITIAL_RENDER_CAP) : assets;

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Scanned Assets Catalog ({assets.length})</h3>
        <div className="flex items-center gap-3">
          {assets.length > INITIAL_RENDER_CAP && (
            <button
              type="button"
              data-testid="asset-table-toggle-all"
              onClick={() => setShowAllRows((prev) => !prev)}
              className="text-xs font-medium text-sky-800 hover:underline focus:outline-none focus:ring-2 focus:ring-slate-900 rounded px-1.5 py-0.5"
            >
              {showAllRows
                ? `Show first ${INITIAL_RENDER_CAP}`
                : `Show all ${assets.length} rows`}
            </button>
          )}
          <span className="text-xs text-slate-600">Asset paths normalized with &apos;/&apos;</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table data-testid="asset-table" className="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="bg-slate-50 text-slate-700 font-medium uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-4 py-3">Asset ID</th>
              <th scope="col" className="px-4 py-3">Type</th>
              <th scope="col" className="px-4 py-3">Size</th>
              <th scope="col" className="px-4 py-3">Capture Time</th>
              <th scope="col" className="px-4 py-3">Source</th>
              <th scope="col" className="px-4 py-3">SHA-256</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {visibleAssets.map((asset) => {
              const sourceInfo = SOURCE_BADGES[asset.captureTimeSource];
              const computedHash = assetHashes[asset.assetId] || asset.sha256;

              return (
                <tr
                  key={asset.assetId}
                  data-testid={`asset-row-${asset.assetId}`}
                  className="hover:bg-slate-50 transition"
                >
                  <td
                    data-testid={`asset-id-${asset.assetId}`}
                    className="px-4 py-2.5 font-mono text-slate-900 font-medium whitespace-nowrap"
                  >
                    {asset.assetId}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span
                      data-testid={`asset-type-${asset.assetId}`}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border ${TYPE_BADGES[asset.assetType]}`}
                    >
                      {asset.assetType}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                    {formatFileSize(asset.sizeBytes)}
                  </td>
                  <td
                    data-testid={`asset-captured-at-${asset.assetId}`}
                    className="px-4 py-2.5 font-mono text-slate-800 whitespace-nowrap"
                  >
                    {asset.capturedAt}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span
                      data-testid="asset-time-source-badge"
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border ${sourceInfo.className}`}
                    >
                      {sourceInfo.label}
                    </span>
                  </td>
                  <td
                    data-testid={`asset-hash-${asset.assetId}`}
                    className="px-4 py-2.5 font-mono text-xs text-slate-800 break-all"
                  >
                    {computedHash ? (
                      <span>{computedHash}</span>
                    ) : asset.hashProgress !== undefined ? (
                      <span className="text-blue-700 font-sans">{asset.hashProgress}%</span>
                    ) : (
                      <span className="text-slate-600 font-sans">Queued</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
