import React, { useEffect, useState } from 'react';
import {
  FileImage,
  FileVideo,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileQuestion,
  Search,
  Filter,
} from 'lucide-react';
import { hasNativePreview, type AssetType } from '../folder';
import { createTypedBlobUrl, safeRevokeBlobUrl } from '../viewers';
import { getAssetStatusInfo } from './selectors';
import type {
  AssetStatusVariant,
  AssetTagState,
  TaggingFilterStatus,
  TaggingFilterType,
  WorkspaceStats,
} from './types';

interface AssetListPaneProps {
  assets: AssetTagState[];
  activeAssetId: string | null;
  fileLookup: Map<string, File>;
  stats: WorkspaceStats;
  statusFilter: TaggingFilterStatus;
  typeFilter: TaggingFilterType;
  searchQuery: string;
  widthPx: number;
  onSelectAsset: (assetId: string) => void;
  onStatusFilterChange: (filter: TaggingFilterStatus) => void;
  onTypeFilterChange: (filter: TaggingFilterType) => void;
  onSearchQueryChange: (query: string) => void;
  onClearFilters: () => void;
}

const STATUS_BADGE_STYLES: Record<AssetStatusVariant, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-300',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-300',
  error: 'bg-rose-50 text-rose-800 border-rose-300 font-semibold',
};

function renderTypeIcon(assetType: AssetType): React.ReactNode {
  const iconCls = 'w-5 h-5 text-slate-500';
  switch (assetType) {
    case 'image':
      return <FileImage className={iconCls} />;
    case 'video':
      return <FileVideo className={iconCls} />;
    case 'audio':
      return <FileAudio className={iconCls} />;
    case 'sensor':
      return <FileSpreadsheet className={iconCls} />;
    case 'document':
      return <FileText className={iconCls} />;
    default:
      return <FileQuestion className={iconCls} />;
  }
}

interface AssetThumbnailProps {
  asset: AssetTagState;
  file?: File;
}

const AssetThumbnail: React.FC<AssetThumbnailProps> = ({ asset, file }) => {
  const canPreviewImage =
    asset.assetType === 'image' && hasNativePreview('image', asset.assetId) && file !== undefined;
  const canPreviewVideo =
    asset.assetType === 'video' && hasNativePreview('video', asset.assetId) && file !== undefined;
  const canPreview = canPreviewImage || canPreviewVideo;

  const [thumbUrl, setThumbUrl] = useState<string>('');
  const [mediaFailed, setMediaFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    setMediaFailed(false);
    setVideoReady(false);
    if (!canPreview || !file) {
      setThumbUrl('');
      return;
    }
    const url = createTypedBlobUrl(file, asset.assetId);
    setThumbUrl(url);
    return () => {
      safeRevokeBlobUrl(url);
    };
  }, [asset.assetId, canPreview, file]);

  if (canPreviewImage && thumbUrl && !mediaFailed) {
    return (
      <div className="w-10 h-10 rounded border border-slate-200 bg-slate-100 overflow-hidden flex-shrink-0">
        <img
          data-testid={`asset-thumb-img-${asset.assetId}`}
          src={thumbUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setMediaFailed(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  if (canPreviewVideo && thumbUrl && !mediaFailed) {
    return (
      <div className="w-10 h-10 rounded border border-slate-200 bg-slate-900 overflow-hidden flex-shrink-0 relative flex items-center justify-center">
        {!videoReady && renderTypeIcon('video')}
        <video
          data-testid={`asset-thumb-video-${asset.assetId}`}
          src={thumbUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            try {
              if (e.currentTarget.currentTime === 0) {
                e.currentTarget.currentTime = 0.01;
              }
            } catch {
              // Ignore seek errors on short/unseekable metadata
            }
          }}
          onLoadedData={() => setVideoReady(true)}
          onError={() => setMediaFailed(true)}
          className={`w-full h-full object-cover ${videoReady ? 'block' : 'hidden'}`}
        />
      </div>
    );
  }

  return (
    <div className="w-10 h-10 rounded border border-slate-200 bg-slate-100 flex items-center justify-center flex-shrink-0">
      {renderTypeIcon(asset.assetType)}
    </div>
  );
};

export const AssetListPane: React.FC<AssetListPaneProps> = ({
  assets,
  activeAssetId,
  fileLookup,
  stats,
  statusFilter,
  typeFilter,
  searchQuery,
  widthPx,
  onSelectAsset,
  onStatusFilterChange,
  onTypeFilterChange,
  onSearchQueryChange,
  onClearFilters,
}) => {
  const progressPercent =
    stats.totalCount > 0 ? Math.round((stats.doneCount / stats.totalCount) * 100) : 0;

  return (
    <aside
      data-testid="asset-list-pane"
      style={{ width: `${widthPx}px` }}
      className="flex-shrink-0 flex flex-col bg-white border-r border-slate-200 h-full overflow-hidden"
    >
      {/* Progress Header */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Assets
          </h2>
          <span
            data-testid="workspace-done-count"
            className="text-xs font-semibold text-slate-800 font-mono"
          >
            {stats.doneCount} of {stats.totalCount} done
          </span>
        </div>

        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-emerald-600 h-1.5 rounded-full transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <div>
            <label htmlFor="asset-status-filter" className="sr-only">
              Filter by status
            </label>
            <select
              id="asset-status-filter"
              data-testid="asset-status-filter"
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value as TaggingFilterStatus)}
              className="w-full text-xs border border-slate-300 rounded px-2 py-1 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="all">All states</option>
              <option value="not_done">Not done</option>
              <option value="untagged">Untagged</option>
              <option value="tagged">Tagged</option>
              <option value="bystanders">Has bystanders</option>
              <option value="bystander_only">Bystander only</option>
              <option value="no_person">No person</option>
            </select>
          </div>

          <div>
            <label htmlFor="asset-type-filter" className="sr-only">
              Filter by type
            </label>
            <select
              id="asset-type-filter"
              data-testid="asset-type-filter"
              value={typeFilter}
              onChange={(e) => onTypeFilterChange(e.target.value as TaggingFilterType)}
              className="w-full text-xs border border-slate-300 rounded px-2 py-1 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="all">All types</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="sensor">Sensor</option>
              <option value="document">Document</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
          <input
            type="search"
            data-testid="asset-search-input"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Filter file path..."
            aria-label="Filter asset list by file path"
            className="w-full pl-8 pr-2.5 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Asset Items List */}
      <div
        role="listbox"
        aria-label="Collection assets"
        data-testid="workspace-asset-list"
        className="flex-1 overflow-y-auto divide-y divide-slate-100"
      >
        {assets.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <Filter className="w-6 h-6 text-slate-300 mx-auto" />
            <p className="text-xs text-slate-500">No assets match active filters.</p>
            <button
              type="button"
              data-testid="clear-asset-filters-btn"
              onClick={onClearFilters}
              className="text-xs font-medium text-sky-700 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          assets.map((asset) => {
            const isSelected = asset.assetId === activeAssetId;
            const statusInfo = getAssetStatusInfo(asset);
            const file = fileLookup.get(asset.assetId);

            return (
              <button
                key={asset.assetId}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-testid={`workspace-asset-item-${asset.assetId}`}
                onClick={() => onSelectAsset(asset.assetId)}
                className={`w-full text-left px-3 py-2.5 flex items-start space-x-2.5 transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-900 ${
                  isSelected ? 'bg-sky-50 border-l-4 border-l-slate-900' : 'hover:bg-slate-50'
                }`}
              >
                <AssetThumbnail asset={asset} file={file} />

                <div className="min-w-0 flex-1 space-y-1">
                  <div
                    className={`text-xs font-mono truncate ${
                      isSelected ? 'font-semibold text-slate-900' : 'text-slate-800'
                    }`}
                    title={asset.assetId}
                  >
                    {asset.assetId}
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                      {asset.assetType}
                    </span>

                    <span
                      data-testid={`workspace-asset-status-${asset.assetId}`}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_BADGE_STYLES[statusInfo.variant]}`}
                    >
                      {statusInfo.label}
                    </span>

                    {statusInfo.primaryStatus === 'not_fully_reviewed' &&
                      asset.personIds.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
                          tagged ({asset.personIds.length})
                        </span>
                      )}

                    {statusInfo.primaryStatus === 'not_fully_reviewed' && asset.noPerson && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
                        no person
                      </span>
                    )}

                    {statusInfo.hasBystanders &&
                      statusInfo.primaryStatus !== 'bystander_only' && (
                        <span
                          data-testid={`workspace-asset-bystander-${asset.assetId}`}
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-300"
                        >
                          bystander ({asset.bystanderCount})
                        </span>
                      )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};
