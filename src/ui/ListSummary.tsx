import React from 'react';
import type { ConsentedListResult } from '../list';

interface ListSummaryProps {
  listResult: ConsentedListResult;
}

export const ListSummary: React.FC<ListSummaryProps> = ({ listResult }) => {
  const nonSelectableCount = listResult.totalCount - listResult.selectableCount;

  return (
    <div data-testid="list-summary" className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Project Name</div>
        <div
          data-testid="list-summary-project"
          className="text-base font-semibold text-slate-900 mt-1 truncate"
        >
          {listResult.projectName}
        </div>
        <div
          data-testid="project-id"
          className="text-[11px] font-mono text-slate-500 mt-0.5 truncate"
          title={listResult.projectId}
        >
          {listResult.projectId}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Participants</div>
        <div data-testid="total-people-count" className="text-2xl font-semibold text-slate-900 mt-1">
          {listResult.totalCount}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">Parsed people records</div>
      </div>

      <div data-testid="list-summary-counts" className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Selectability Breakdown</div>
        <div className="flex items-center space-x-2 mt-1 flex-wrap">
          <span data-testid="selectable-count" className="text-sm font-semibold text-emerald-700">
            {listResult.selectableCount} selectable
          </span>
          <span className="text-slate-300">/</span>
          <span data-testid="non-selectable-count" className="text-sm font-semibold text-amber-700">
            {nonSelectableCount} not selectable
          </span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {listResult.totalCount} people, {nonSelectableCount} not selectable
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">List Validity</div>
        <div data-testid="list-valid-until" className="text-xs font-mono font-medium text-slate-900 mt-1">
          {listResult.listValidUntil}
        </div>
        <div className="text-xs text-emerald-600 font-medium mt-0.5">Active authorization period</div>
      </div>
    </div>
  );
};
