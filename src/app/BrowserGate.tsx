import type React from 'react';
import { isFileSystemAccessSupported } from './capabilities';

export interface BrowserGateProps {
  children: React.ReactNode;
  supportedOverride?: boolean;
}

export const BrowserGate: React.FC<BrowserGateProps> = ({ children, supportedOverride }) => {
  let isSupported = false;
  try {
    const evaluatedOverride =
      supportedOverride !== null && typeof supportedOverride === 'object' && 'valueOf' in supportedOverride
        ? (supportedOverride as { valueOf: () => unknown }).valueOf()
        : supportedOverride;
    isSupported = evaluatedOverride !== undefined ? Boolean(evaluatedOverride) : isFileSystemAccessSupported();
  } catch {
    // Fallback to unsupported if evaluation throws unexpectedly
    isSupported = false;
  }

  if (!isSupported) {
    return (
      <main
        id="browser-gate-unsupported"
        role="alert"
        aria-live="polite"
        className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-6"
      >
        <div className="max-w-md w-full bg-white rounded-lg border border-slate-200 p-8 shadow-sm text-center">
          <h1 className="text-base font-medium text-slate-800 leading-relaxed">
            This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.
          </h1>
        </div>
      </main>
    );
  }

  return <>{children}</>;
};

export default BrowserGate;
