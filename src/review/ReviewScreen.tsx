import React from 'react';
import { ArrowLeft, Download, FileCheck2, Save } from 'lucide-react';
import type { AssetType } from '../folder';
import type { ReviewCandidate } from './types';

interface ReviewScreenProps {
  review: ReviewCandidate;
  onBackToWorkspace: () => void;
  onBackToStart: () => void;
  onJumpToAsset: (assetId: string) => void;
}

const ASSET_TYPES: AssetType[] = ['image', 'video', 'audio', 'sensor', 'document', 'other'];

export const ReviewScreen: React.FC<ReviewScreenProps> = ({
  review,
  onBackToWorkspace,
  onBackToStart,
  onJumpToAsset,
}) => {
  const handleDownload = () => {
    review.downloadCopy();
  };

  return (
    <main data-testid="review-screen" className="flex-1 w-full max-w-7xl mx-auto p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Review &amp; Save</h2>
          <p className="mt-1 text-sm text-slate-600">
            Check the export rows and resolve all errors before saving.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="review-back-to-workspace-btn"
            onClick={onBackToWorkspace}
            className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Workspace
          </button>
          <button
            type="button"
            data-testid="review-back-to-start-btn"
            onClick={onBackToStart}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to Start
          </button>
        </div>
      </div>

      <section aria-labelledby="review-summary-heading" className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <h3 id="review-summary-heading" className="mb-4 text-lg font-semibold">Summary</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Metric label="Assets" value={review.metrics.totalAssets} />
          <Metric label="Export rows" value={review.metrics.exportRowCount} />
          <Metric label="People tagged" value={review.metrics.uniquePeopleTagged} />
          <Metric label="Held for bystanders" value={review.metrics.heldAssetsCount} />
          <Metric label="Not done" value={review.metrics.notDoneAssetsCount} />
          <Metric label="Deleted assets" value={review.metrics.deletedAssets} />
          <Metric label="Person tag rows" value={review.metrics.personTagRows} />
          <Metric label="Hashes missing" value={review.metrics.unhashedAssetsCount} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Asset counts by type">
          {ASSET_TYPES.map((type) => (
            <span key={type} className="rounded bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
              {type}: {review.metrics.countsByType[type]}
            </span>
          ))}
        </div>
      </section>

      <FindingSection
        title="Errors"
        testId="review-errors"
        emptyText="No validation or readiness errors."
        items={review.errors.map((error) => ({
          key: error.key,
          code: error.code,
          message: error.message,
          assetId: error.assetId,
        }))}
        onJumpToAsset={onJumpToAsset}
      />

      <section data-testid="review-warnings" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
        <h3 className="mb-3 text-lg font-semibold text-amber-950">Warnings</h3>
        {review.warnings.length === 0 &&
        review.sheet.heldAssets.length === 0 &&
        review.sheet.fileDateAssets.length === 0 &&
        review.sheet.missingHashAssets.length === 0 &&
        review.filenameWarnings.length === 0 ? (
          <p className="text-sm text-amber-900">No warnings.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {review.sheet.heldAssets.map((assetId) => (
              <li key={`held-${assetId}`} className="flex flex-wrap items-center gap-2">
                <span>[W02] This asset has bystanders and will be held.</span>
                <AssetLink assetId={assetId} onJumpToAsset={onJumpToAsset} />
              </li>
            ))}
            {review.warnings
              .filter((warning) => warning.code !== 'W01' && warning.code !== 'W02')
              .map((warning) => (
              <li key={warning.key} className="flex flex-wrap items-center gap-2">
                <span>[{warning.code}] {warning.message}</span>
                {warning.assetId && (
                  <AssetLink assetId={warning.assetId} onJumpToAsset={onJumpToAsset} />
                )}
              </li>
            ))}
            {review.sheet.fileDateAssets.map((assetId) => (
              <li key={`file-date-${assetId}`} className="flex flex-wrap items-center gap-2">
                <span>[CAPTURE_TIME] Capture time comes from the file date.</span>
                <AssetLink assetId={assetId} onJumpToAsset={onJumpToAsset} />
              </li>
            ))}
            {review.sheet.missingHashAssets.map((assetId) => (
              <li key={`missing-hash-${assetId}`} className="flex flex-wrap items-center gap-2">
                <span>[W01] This asset has no computed SHA-256 hash.</span>
                <AssetLink assetId={assetId} onJumpToAsset={onJumpToAsset} />
              </li>
            ))}
            {review.filenameWarnings.map((warning) => (
              <li key={`filename-${warning.assetId}`} className="flex flex-wrap items-center gap-2">
                <span>[FILENAME_PII] {warning.message}</span>
                <AssetLink assetId={warning.assetId} onJumpToAsset={onJumpToAsset} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="save-sheet-btn"
          disabled={!review.canSave}
          onClick={() => void review.saveSheet()}
          className="inline-flex items-center gap-2 rounded bg-sky-700 px-4 py-2 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {review.isSaving ? <Save className="h-4 w-4 animate-pulse" /> : <FileCheck2 className="h-4 w-4" />}
          Save sheet
        </button>
        <button
          type="button"
          data-testid="download-sheet-btn"
          disabled={!review.canDownload}
          onClick={handleDownload}
          className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Download a copy
        </button>
        {review.saveError && (
          <p role="alert" data-testid="save-sheet-error" className="text-sm text-red-700">
            {review.saveError}
          </p>
        )}
      </div>

      {review.lastSaved?.saved && (
        <section className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-medium text-emerald-900">Sheet saved successfully.</p>
          <p className="mt-1 text-emerald-800" data-testid="saved-file-name">
            {review.lastSaved.fileName}
          </p>
          <p className="mt-1 text-emerald-800" data-testid="saved-export-id">
            {review.lastSaved.exportId}
          </p>
          <p className="mt-1 text-emerald-800">
            Held assets: {review.lastSaved.heldAssets.length}
          </p>
        </section>
      )}
    </main>
  );
};

interface FindingSectionProps {
  title: string;
  testId: string;
  emptyText: string;
  items: Array<{ key: string; code: string; message: string; assetId?: string }>;
  onJumpToAsset: (assetId: string) => void;
}

const FindingSection: React.FC<FindingSectionProps> = ({
  title,
  testId,
  emptyText,
  items,
  onJumpToAsset,
}) => (
  <section data-testid={testId} className="mb-6 rounded-lg border border-red-200 bg-white p-5">
    <h3 className="mb-3 text-lg font-semibold text-red-900">{title}</h3>
    {items.length === 0 ? (
      <p className="text-sm text-slate-600">{emptyText}</p>
    ) : (
      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.key} className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold text-red-800">[{item.code}]</span>
            <span>{item.message}</span>
            {item.assetId && <AssetLink assetId={item.assetId} onJumpToAsset={onJumpToAsset} />}
          </li>
        ))}
      </ul>
    )}
  </section>
);

const AssetLink: React.FC<{
  assetId: string;
  onJumpToAsset: (assetId: string) => void;
}> = ({ assetId, onJumpToAsset }) => (
  <button
    type="button"
    data-testid={`error-jump-${assetId}`}
    onClick={() => onJumpToAsset(assetId)}
    className="font-mono text-sky-800 underline underline-offset-2 hover:text-sky-950"
  >
    {assetId}
  </button>
);

const Metric: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded border border-slate-100 bg-slate-50 p-3">
    <p className="text-xs text-slate-500">{label}</p>
    <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
  </div>
);
