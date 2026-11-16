import React from 'react';
import { History, AlertTriangle, Wrench, ShieldAlert, CheckCircle2 } from 'lucide-react';
import {
  isListDeletionReminderDue,
  type ProgressDocument,
  type ProgressReconciliationResult,
  type ProgressSaveEntry,
  type ListDeletionReminderStatus,
} from '../folder';

interface ResumeBannerProps {
  detectedProgress: ProgressDocument | null;
  progressReadError: string | null;
  reconciliation: ProgressReconciliationResult | null;
  listDeletionReminder: ListDeletionReminderStatus;
  savedEntries?: ProgressSaveEntry[];
  isReadyForTagging: boolean;
  onGoToCorrections?: () => void;
}

export const ResumeBanner: React.FC<ResumeBannerProps> = ({
  detectedProgress,
  progressReadError,
  reconciliation,
  listDeletionReminder,
  savedEntries,
  isReadyForTagging,
  onGoToCorrections,
}) => {
  const effectiveSaves =
    savedEntries && savedEntries.length > 0
      ? savedEntries
      : detectedProgress?.saves ?? [];

  const effectiveReminder =
    detectedProgress && savedEntries && savedEntries.length > 0
      ? isListDeletionReminderDue({ ...detectedProgress, saves: effectiveSaves })
      : listDeletionReminder;

  if (!detectedProgress && !progressReadError && !effectiveReminder.due) {
    return null;
  }

  const summary = reconciliation?.summary;
  const lastSave =
    effectiveSaves.length > 0 ? effectiveSaves[effectiveSaves.length - 1] : null;
  const totalHeldCount = summary?.heldFromSaveIds.length ?? (lastSave?.held.length ?? 0);

  return (
    <div className="space-y-4">
      {progressReadError && (
        <div
          data-testid="progress-read-error"
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-xs text-amber-900 flex items-start space-x-3"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Could not parse existing progress file (.dct-progress.json)</p>
            <p className="text-amber-800 mt-0.5">{progressReadError}</p>
          </div>
        </div>
      )}

      {effectiveReminder.due && (
        <div
          data-testid="list-deletion-reminder"
          role="status"
          className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-xs text-amber-950 flex items-start space-x-3"
        >
          <ShieldAlert className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">
              List deletion reminder ({effectiveReminder.daysSinceLastSave} days since last save)
            </p>
            <p className="text-amber-900 mt-0.5">
              The last exported sheet for this project is more than 7 days old (
              <span className="font-mono">{effectiveReminder.lastSavedAt}</span>). Please delete
              the consented list file from this collection machine once the export is accepted.
            </p>
          </div>
        </div>
      )}

      {detectedProgress && (
        <div
          data-testid="resume-banner"
          className="bg-sky-50/70 border border-sky-200 rounded-lg p-5 shadow-sm space-y-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-sky-100 rounded-lg text-sky-800">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Resume Existing Collection (`.dct-progress.json`)
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Progress saved for project{' '}
                  <code className="font-mono text-slate-900">{detectedProgress.project_id}</code>
                  . Load the matching consented list below to restore all tags.
                </p>
              </div>
            </div>

            {effectiveSaves.length > 0 && onGoToCorrections && (
              <button
                type="button"
                data-testid="go-to-corrections-btn"
                onClick={onGoToCorrections}
                disabled={!isReadyForTagging}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-md text-xs font-medium bg-amber-700 text-white hover:bg-amber-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>
                  Corrections &amp; Deletions
                  {totalHeldCount > 0 ? ` (${totalHeldCount} held)` : ''}
                </span>
              </button>
            )}
          </div>

          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-xs">
              <div className="bg-white rounded border border-slate-200 px-3 py-2">
                <div className="text-slate-600">Restored tagged</div>
                <div
                  data-testid="resume-restored-count"
                  className="font-mono font-semibold text-slate-900 text-sm"
                >
                  {summary.restoredTaggedCount}
                </div>
              </div>

              <div className="bg-white rounded border border-slate-200 px-3 py-2">
                <div className="text-slate-600">New untagged</div>
                <div
                  data-testid="resume-untagged-count"
                  className={`font-mono font-semibold text-sm ${
                    summary.untaggedNewIds.length > 0 ? 'text-sky-700' : 'text-slate-900'
                  }`}
                >
                  {summary.untaggedNewIds.length}
                </div>
              </div>

              <div className="bg-white rounded border border-slate-200 px-3 py-2">
                <div className="text-slate-600">Missing files</div>
                <div
                  data-testid="resume-missing-count"
                  className={`font-mono font-semibold text-sm ${
                    summary.missingIds.length > 0 ? 'text-rose-700' : 'text-slate-900'
                  }`}
                >
                  {summary.missingIds.length}
                </div>
              </div>

              <div className="bg-white rounded border border-slate-200 px-3 py-2">
                <div className="text-slate-600">Changed files</div>
                <div
                  data-testid="resume-changed-count"
                  className={`font-mono font-semibold text-sm ${
                    summary.changedIds.length > 0 ? 'text-amber-800' : 'text-slate-900'
                  }`}
                >
                  {summary.changedIds.length}
                </div>
              </div>
            </div>
          )}

          {summary && summary.missingIds.length > 0 && (
            <div
              data-testid="resume-missing-list"
              className="text-xs text-rose-900 bg-rose-50 border border-rose-200 rounded px-3 py-2"
            >
              <strong>Missing from folder:</strong>{' '}
              <span className="font-mono">{summary.missingIds.join(', ')}</span>
            </div>
          )}

          {summary && summary.untaggedNewIds.length > 0 && (
            <div
              data-testid="resume-untagged-list"
              className="text-xs text-sky-900 bg-white border border-sky-200 rounded px-3 py-2"
            >
              <strong>New files added (untagged):</strong>{' '}
              <span className="font-mono">{summary.untaggedNewIds.join(', ')}</span>
            </div>
          )}

          {summary && summary.changedIds.length > 0 && (
            <div
              data-testid="resume-changed-list"
              className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2"
            >
              <strong>Changed since saved progress (check tags):</strong>{' '}
              <span className="font-mono">{summary.changedIds.join(', ')}</span>
            </div>
          )}

          {lastSave && (
            <div
              data-testid="resume-last-save-info"
              className="flex items-center space-x-2 text-xs text-slate-600 pt-1"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              <span>
                Last sheet saved: <code className="font-mono text-slate-900">{lastSave.file}</code>{' '}
                at <span className="font-mono">{lastSave.saved_at}</span>
                {lastSave.held.length > 0
                  ? ` (${lastSave.held.length} asset(s) held for bystanders)`
                  : ' (0 held assets)'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
