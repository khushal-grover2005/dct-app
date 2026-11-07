import React from 'react';
import { AlertCircle } from 'lucide-react';
import type { ListValidationError } from '../list';

interface ListErrorBannerProps {
  errors: ListValidationError[];
}

export const ListErrorBanner: React.FC<ListErrorBannerProps> = ({ errors }) => {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="list-error-banner"
      className="bg-rose-50 border border-rose-200 rounded-lg p-4 mb-4 text-rose-800"
    >
      <div className="flex items-center space-x-2 font-semibold text-sm mb-1.5">
        <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
        <span>Consented List Refused (L01–L04 Data Contract Violation)</span>
      </div>
      <p className="text-xs text-rose-700 mb-2">
        The loaded CSV list violates data contract constraints and has been refused whole:
      </p>
      <ul className="list-disc list-inside space-y-1 text-xs">
        {errors.map((err, idx) => (
          <li key={idx} data-testid="list-error-message">
            <span className="font-mono font-semibold">[{err.code}]</span> {err.message}
            {err.line !== undefined && (
              <span className="text-rose-600 ml-1">(row {err.line})</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
