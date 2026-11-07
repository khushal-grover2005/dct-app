import React, { useRef } from 'react';
import { FileText } from 'lucide-react';
import type { AppPipeline } from './types';
import { ListErrorBanner } from './ListErrorBanner';
import { ListSummary } from './ListSummary';
import { ParticipantTable } from './ParticipantTable';

interface ListSectionProps {
  pipeline: AppPipeline;
}

export const ListSection: React.FC<ListSectionProps> = ({ pipeline }) => {
  const { consentedList, listLoading, listErrors, loadListFromFile } = pipeline;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await loadListFromFile(file);
      // Reset input value to allow selecting the same file again
      e.target.value = '';
    }
  };

  return (
    <div data-testid="list-section" className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-slate-100 rounded-lg text-slate-700">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">2. Consented Participants List</h2>
            <p className="text-xs text-slate-500">
              Load consented participants CSV file (strictly validated under rules L01–L04)
            </p>
          </div>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            data-testid="consented-list-input"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            data-testid="load-list-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={listLoading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 transition"
          >
            {listLoading
              ? 'Validating CSV...'
              : consentedList
                ? 'Reload consented list'
                : 'Load consented list'}
          </button>
        </div>
      </div>

      <div className="mt-4">
        {listErrors.length > 0 && <ListErrorBanner errors={listErrors} />}

        {!consentedList && listErrors.length === 0 && !listLoading && (
          <div className="p-4 rounded-md bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500">
            No consented list loaded. Click &quot;Load consented list&quot; to select a CSV file.
          </div>
        )}

        {consentedList && (
          <div className="space-y-4">
            <ListSummary listResult={consentedList} />
            <ParticipantTable listResult={consentedList} />
          </div>
        )}
      </div>
    </div>
  );
};
