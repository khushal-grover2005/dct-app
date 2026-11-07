import React, { useMemo } from 'react';
import { FolderOpen, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { AppPipeline } from './types';
import type { AssetType } from '../folder';

interface FolderSectionProps {
  pipeline: AppPipeline;
}

const TYPE_COLORS: Record<AssetType, string> = {
  image: 'bg-sky-50 text-sky-700 border-sky-200',
  video: 'bg-purple-50 text-purple-700 border-purple-200',
  audio: 'bg-amber-50 text-amber-700 border-amber-200',
  sensor: 'bg-teal-50 text-teal-700 border-teal-200',
  document: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  other: 'bg-slate-100 text-slate-700 border-slate-300',
};

export const FolderSection: React.FC<FolderSectionProps> = ({ pipeline }) => {
  const {
    folderName,
    assets,
    folderScanning,
    folderWarnings,
    hashingProgress,
    hashingCompleted,
    openFolder,
  } = pipeline;

  const typeCounts = useMemo(() => {
    const counts: Record<AssetType, number> = {
      image: 0,
      video: 0,
      audio: 0,
      sensor: 0,
      document: 0,
      other: 0,
    };
    for (const a of assets) {
      counts[a.assetType] = (counts[a.assetType] ?? 0) + 1;
    }
    return counts;
  }, [assets]);

  return (
    <div data-testid="folder-section" className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-slate-100 rounded-lg text-slate-700">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">1. Collection Folder</h2>
            <p className="text-xs text-slate-500">Select directory of captured assets to inspect and hash</p>
          </div>
        </div>
        <button
          type="button"
          data-testid="open-folder-button"
          onClick={() => void openFolder()}
          disabled={folderScanning}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 transition"
        >
          {folderScanning ? 'Scanning folder...' : folderName ? 'Change folder' : 'Open collection folder'}
        </button>
      </div>

      {!folderName && !folderScanning && (
        <div className="mt-4 p-4 rounded-md bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500">
          No collection folder opened. Click &quot;Open collection folder&quot; to begin.
        </div>
      )}

      {folderName && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span
              data-testid="folder-name"
              className="px-3 py-1 rounded-md text-xs font-mono font-medium bg-slate-100 text-slate-800 border border-slate-200"
            >
              📁 {folderName}/
            </span>
            <span
              data-testid="asset-count-badge"
              className="px-3 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200"
            >
              {assets.length} assets found
            </span>
            {(Object.keys(typeCounts) as AssetType[]).map((type) => {
              const count = typeCounts[type];
              if (count === 0 && type !== 'other') return null;
              return (
                <span
                  key={type}
                  data-testid={`type-pill-${type}`}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLORS[type]}`}
                >
                  {count} {type}
                </span>
              );
            })}
            {typeCounts.other > 0 && (
              <span
                data-testid="other-warning-pill"
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-300"
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                {typeCounts.other} unclassified &apos;other&apos; file(s)
              </span>
            )}
          </div>

          {/* Hashing progress */}
          <div
            data-testid="hashing-progress-bar"
            className="bg-slate-50 border border-slate-200 rounded-md p-3"
          >
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-medium text-slate-700">SHA-256 Hashing Status</span>
              <span data-testid="hash-progress-text" className="text-xs font-mono text-slate-600">
                {hashingCompleted ? (
                  <span data-testid="hash-complete-badge" className="inline-flex items-center text-emerald-700 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Completed (100%)
                  </span>
                ) : hashingProgress.totalAssets > 0 ? (
                  `${hashingProgress.completedAssets} of ${hashingProgress.totalAssets} assets (${hashingProgress.overallPercent}%)`
                ) : (
                  'Waiting...'
                )}
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-600 h-2 transition-all duration-300 rounded-full"
                style={{ width: `${hashingCompleted ? 100 : hashingProgress.overallPercent}%` }}
              />
            </div>
          </div>

          {/* Warnings callout */}
          {folderWarnings.length > 0 && (
            <div
              data-testid="folder-warnings-callout"
              className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800 space-y-1"
            >
              <div className="font-semibold flex items-center">
                <AlertTriangle className="w-4 h-4 mr-1 text-amber-600" /> Collection Warnings:
              </div>
              <ul className="list-disc list-inside space-y-0.5">
                {folderWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
