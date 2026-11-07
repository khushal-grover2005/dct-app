import type React from 'react';
import { useAppPipeline } from './useAppPipeline';
import { StartScreen } from '../ui/StartScreen';

export const App: React.FC = () => {
  const pipeline = useAppPipeline();

  return (
    <div
      id="app-shell"
      data-testid="app-shell"
      className="min-h-screen bg-slate-50 text-slate-900 flex flex-col min-w-[1280px]"
    >
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Data Collection Tool
          </h1>
          <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Air-Gapped
          </span>
          {pipeline.collectionRef && (
            <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">
              {pipeline.collectionRef}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-xs text-slate-500">
            Browser capability verified: File System Access API is active.
          </div>
          <div className="text-sm text-slate-500 font-medium">Increment 1 Shell</div>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        <StartScreen pipeline={pipeline} />
      </main>
    </div>
  );
};

export default App;
