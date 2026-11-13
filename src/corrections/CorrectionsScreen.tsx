import React, { useRef } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileUp,
  Save,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { UseCorrectionsResult } from './useCorrections';

export interface CorrectionsScreenProps {
  corrections: UseCorrectionsResult;
  onBackToWorkspace: () => void;
  onBackToStart: () => void;
}

export const CorrectionsScreen: React.FC<CorrectionsScreenProps> = ({
  corrections,
  onBackToWorkspace,
  onBackToStart,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleLoadFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await corrections.loadDeletionRequestFile(file);
    event.target.value = '';
  };

  const canFind =
    corrections.deletionRequestText.trim().length > 0 &&
    !corrections.isCheckingDeletionRequests;
  const canSaveCorrection =
    Boolean(corrections.preview && corrections.preview.valid) &&
    !corrections.isSaving &&
    !corrections.isDeletingBatch;
  const canDownloadCorrection =
    Boolean(corrections.lastSaved) || Boolean(corrections.preview && corrections.preview.valid);

  return (
    <main data-testid="corrections-screen" className="flex-1 w-full max-w-7xl mx-auto p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Corrections &amp; Deletions</h2>
          <p className="mt-1 text-sm text-slate-600">
            Resolve held bystander assets, remove files requested for deletion, and save a correction sheet.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="corrections-back-to-workspace-btn"
            onClick={onBackToWorkspace}
            className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Workspace
          </button>
          <button
            type="button"
            data-testid="corrections-back-to-start-btn"
            onClick={onBackToStart}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to Start
          </button>
        </div>
      </div>

      {/* Section 1: Held Assets */}
      <section
        data-testid="held-assets-section"
        aria-labelledby="held-assets-heading"
        className="mb-6 rounded-lg border border-slate-200 bg-white p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h3 id="held-assets-heading" className="text-lg font-semibold text-slate-900">
              Held assets ({corrections.heldAssets.length})
            </h3>
            <p className="text-sm text-slate-600">
              Assets exported with bystanders remain held until you replace them with a redacted copy or delete them.
            </p>
          </div>
        </div>

        {corrections.heldAssets.length === 0 ? (
          <p data-testid="held-assets-empty" className="text-sm text-slate-500">
            No held assets with bystanders in this collection.
          </p>
        ) : (
          <div className="space-y-3">
            {corrections.heldAssets.map((item) => {
              const isRedacting = corrections.redactingAssetIds.has(item.assetId);
              const isConfirmingDelete = corrections.pendingDeleteHeldAssetId === item.assetId;
              return (
                <div
                  key={item.assetId}
                  data-testid={`held-asset-card-${item.assetId}`}
                  className="rounded-md border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900">
                          {item.assetId}
                        </span>
                        <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {item.assetType}
                        </span>
                        {item.outcome === 'redacted' ? (
                          <span
                            data-testid="held-outcome-redacted"
                            className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Redacted
                          </span>
                        ) : item.outcome === 'deleted' ? (
                          <span
                            data-testid="held-outcome-deleted"
                            className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-0.5 text-xs font-medium text-white"
                          >
                            Deleted
                          </span>
                        ) : (
                          <span
                            data-testid="held-outcome-pending"
                            className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                          >
                            Held
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span>Bystanders: {item.bystanderCount}</span>
                        <span>Tagged people: {item.personIds.length}</span>
                        {item.sha256 ? (
                          <span className="font-mono">SHA-256: {item.sha256.slice(0, 12)}…</span>
                        ) : (
                          <span>SHA-256: pending</span>
                        )}
                      </div>
                    </div>

                    {item.outcome === 'pending' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          data-testid="redact-held-btn"
                          data-asset-id={item.assetId}
                          disabled={isRedacting}
                          onClick={() => void corrections.redactHeldAsset(item.assetId)}
                          className="inline-flex items-center gap-1.5 rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {isRedacting ? 'Checking hash…' : 'I redacted it'}
                        </button>
                        <button
                          type="button"
                          data-testid="delete-held-btn"
                          data-asset-id={item.assetId}
                          disabled={isRedacting}
                          onClick={() => void corrections.requestDeleteHeldAsset(item.assetId)}
                          className="inline-flex items-center gap-1.5 rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          I deleted it
                        </button>
                      </div>
                    )}
                  </div>

                  {isConfirmingDelete && (
                    <div
                      data-testid="confirm-held-delete-box"
                      className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
                    >
                      <span>
                        Permanently delete <strong className="font-mono">{item.assetId}</strong> from the collection folder and mark it deleted?
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          data-testid="confirm-held-delete-btn"
                          onClick={() => void corrections.confirmDeleteHeldAsset(item.assetId)}
                          className="rounded bg-red-700 px-3 py-1 text-xs font-medium text-white hover:bg-red-800"
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          data-testid="cancel-held-delete-btn"
                          onClick={corrections.cancelDeleteHeldAsset}
                          className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {item.errorMessage && (
                    <div
                      role="alert"
                      data-testid="held-error-banner"
                      className="mt-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-800"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                      <span>{item.errorMessage}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: Deletion Requests */}
      <section
        data-testid="deletion-requests-section"
        aria-labelledby="deletion-requests-heading"
        className="mb-6 rounded-lg border border-slate-200 bg-white p-5"
      >
        <h3 id="deletion-requests-heading" className="text-lg font-semibold text-slate-900">
          Deletion requests
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Paste relative asset paths (one per line or comma-separated) or load a coordinator list to check and remove files from the folder.
        </p>

        <div className="mt-3">
          <label htmlFor="deletion-request-input" className="sr-only">
            Asset IDs to delete
          </label>
          <textarea
            id="deletion-request-input"
            data-testid="deletion-request-textarea"
            rows={4}
            value={corrections.deletionRequestText}
            onChange={(e) => corrections.setDeletionRequestText(e.target.value)}
            placeholder={'IMG-0003.png\nNOPE.png'}
            className="w-full rounded border border-slate-300 p-2.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv"
            data-testid="deletion-request-file-input"
            onChange={(e) => void handleLoadFileChange(e)}
            className="hidden"
          />
          <button
            type="button"
            data-testid="deletion-load-file-btn"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <FileUp className="h-4 w-4" />
            Load file
          </button>
          <button
            type="button"
            data-testid="deletion-find-btn"
            disabled={!canFind}
            onClick={() => void corrections.checkDeletionRequests()}
            className="inline-flex items-center gap-1.5 rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Search className="h-4 w-4" />
            {corrections.isCheckingDeletionRequests ? 'Checking…' : 'Find'}
          </button>
        </div>

        {corrections.deletionError && (
          <div
            role="alert"
            data-testid="deletion-error-banner"
            className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {corrections.deletionError}
          </div>
        )}

        {corrections.deletionCheckResult && (
          <div data-testid="deletion-check-results" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <div
                  data-testid="deletion-found-count"
                  className="text-sm font-semibold text-slate-900"
                >
                  Found in folder: {corrections.deletionCheckResult.foundIds.length}
                </div>
                {corrections.deletionCheckResult.foundIds.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">No matching files currently in folder.</p>
                ) : (
                  <ul
                    data-testid="deletion-found-list"
                    className="mt-2 space-y-1 font-mono text-xs text-slate-800"
                  >
                    {corrections.deletionCheckResult.foundIds.map((id) => (
                      <li key={id}>{id}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <div
                  data-testid="deletion-not-found-count"
                  className="text-sm font-semibold text-slate-900"
                >
                  Not found: {corrections.deletionCheckResult.notFoundIds.length}
                </div>
                {corrections.deletionCheckResult.notFoundIds.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">All requested IDs were found.</p>
                ) : (
                  <ul
                    data-testid="deletion-not-found-list"
                    className="mt-2 space-y-1 font-mono text-xs text-slate-600"
                  >
                    {corrections.deletionCheckResult.notFoundIds.map((id) => (
                      <li key={id}>{id}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {corrections.deletionCheckResult.foundIds.length > 0 &&
              (!corrections.pendingBatchDeleteConfirm ? (
                <button
                  type="button"
                  data-testid="batch-delete-btn"
                  disabled={corrections.isDeletingBatch}
                  onClick={corrections.requestBatchDelete}
                  className="inline-flex items-center gap-2 rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:bg-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete found files ({corrections.deletionCheckResult.foundIds.length})
                </button>
              ) : (
                <div
                  data-testid="batch-delete-confirm-box"
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
                >
                  <span>
                    Permanently delete{' '}
                    <strong>{corrections.deletionCheckResult.foundIds.length}</strong> file(s) from the
                    collection folder and mark them deleted?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="confirm-batch-delete-btn"
                      disabled={corrections.isDeletingBatch}
                      onClick={() => void corrections.confirmBatchDelete()}
                      className="rounded bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60"
                    >
                      {corrections.isDeletingBatch
                        ? 'Deleting…'
                        : `Confirm delete ${corrections.deletionCheckResult.foundIds.length} file(s)`}
                    </button>
                    <button
                      type="button"
                      data-testid="cancel-batch-delete-btn"
                      disabled={corrections.isDeletingBatch}
                      onClick={corrections.cancelBatchDelete}
                      className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {corrections.lastBatchDeletedIds.length > 0 && (
          <div
            data-testid="batch-deleted-notice"
            className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
          >
            Deleted {corrections.lastBatchDeletedIds.length} file(s) from the folder and staged them for the correction sheet.
          </div>
        )}
      </section>

      {/* Section 3: Correction Sheet Save */}
      <section
        data-testid="correction-save-section"
        aria-labelledby="correction-save-heading"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <h3 id="correction-save-heading" className="text-lg font-semibold text-slate-900">
          Correction sheet export
        </h3>

        {corrections.stagedAssetIds.length === 0 ? (
          <p data-testid="correction-staged-empty" className="mt-2 text-sm text-slate-500">
            No pending corrections or deletions staged yet. Redact or delete assets above to build a correction sheet.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Staged assets</div>
                <div data-testid="correction-staged-count" className="mt-1 text-xl font-semibold">
                  {corrections.stagedAssetIds.length}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Corrected</div>
                <div className="mt-1 text-xl font-semibold">
                  {corrections.preview?.correctedCount ?? 0}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Deleted</div>
                <div className="mt-1 text-xl font-semibold">
                  {corrections.preview?.deletedCount ?? 0}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Export rows</div>
                <div data-testid="correction-row-count" className="mt-1 text-xl font-semibold">
                  {corrections.preview?.rowCount ?? 0}
                </div>
              </div>
            </div>

            {corrections.preview && corrections.preview.errors.length > 0 && (
              <div
                data-testid="correction-preview-errors"
                className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900"
              >
                <div className="font-semibold">Validation errors</div>
                <ul className="mt-1 list-disc pl-5">
                  {corrections.preview.errors.map((err, idx) => (
                    <li key={`${err.code}-${idx}`}>
                      [{err.code}] {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {corrections.preview && corrections.preview.warnings.length > 0 && (
              <div
                data-testid="correction-preview-warnings"
                className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              >
                <div className="font-semibold">Warnings</div>
                <ul className="mt-1 list-disc pl-5">
                  {corrections.preview.warnings.map((w, idx) => (
                    <li key={`${w.code}-${idx}`}>
                      [{w.code}] {w.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="save-correction-btn"
            disabled={!canSaveCorrection}
            onClick={() => void corrections.saveCorrectionSheet()}
            className="inline-flex items-center gap-2 rounded bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Save className="h-4 w-4" />
            {corrections.isSaving ? 'Saving correction sheet…' : 'Save correction sheet'}
          </button>

          <button
            type="button"
            data-testid="download-correction-btn"
            disabled={!canDownloadCorrection}
            onClick={corrections.downloadCorrectionSheet}
            className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Download a copy
          </button>
        </div>

        {corrections.saveError && (
          <div
            role="alert"
            data-testid="correction-save-error"
            className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {corrections.saveError}
          </div>
        )}

        {corrections.lastSaved && (
          <div
            data-testid="correction-save-success"
            className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
          >
            <div className="font-semibold">Correction sheet saved successfully.</div>
            <div className="mt-1 font-mono text-xs">{corrections.lastSaved.fileName}</div>
            <div className="mt-1 font-mono text-xs">{corrections.lastSaved.exportId}</div>
            <div className="mt-1 text-xs">Rows: {corrections.lastSaved.rowCount}</div>
          </div>
        )}
      </section>
    </main>
  );
};
