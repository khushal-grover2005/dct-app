import React from 'react';
import type { ConsentedListResult } from '../list';

interface ParticipantTableProps {
  listResult: ConsentedListResult;
}

export const ParticipantTable: React.FC<ParticipantTableProps> = ({ listResult }) => {
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <h3 className="text-sm font-semibold text-slate-800">
          Consented Participants Preview ({listResult.totalCount})
        </h3>
        <span className="text-xs text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
          In-Memory Only (AGENTS.md Rule 8)
        </span>
      </div>
      <div className="overflow-x-auto">
        <table data-testid="participant-table" className="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 font-medium uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-4 py-3">Person ID</th>
              <th scope="col" className="px-4 py-3">Display Name</th>
              <th scope="col" className="px-4 py-3">Contact Hint</th>
              <th scope="col" className="px-4 py-3">Consent Expires</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Selectability Reason</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {listResult.people.map((person) => (
              <tr
                key={person.personId}
                data-testid={`participant-row-${person.personId}`}
                className="hover:bg-slate-50 transition"
              >
                <td data-testid="participant-id" className="px-4 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                  {person.personId}
                </td>
                <td data-testid="participant-name" className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                  {person.displayName}
                </td>
                <td data-testid="participant-contact" className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                  {person.contactHint || '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                  {person.consentExpiresAt || 'No expiration'}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span
                    data-testid="participant-status-badge"
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                      person.isSelectable
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-300'
                    }`}
                  >
                    {person.isSelectable ? 'Selectable' : 'Not Selectable'}
                  </span>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {person.formattedReason && (
                    <span
                      data-testid="participant-reason-badge"
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                        person.nonSelectableReason === 'minor'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {person.formattedReason}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
