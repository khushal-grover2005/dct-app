import React, { useState } from 'react';
import { ArrowRight, Tag, CheckCircle } from 'lucide-react';
import type { StartScreenProps } from './types';
import { FolderSection } from './FolderSection';
import { AssetTable } from './AssetTable';
import { ListSection } from './ListSection';

export const StartScreen: React.FC<StartScreenProps> = ({ pipeline, onProceed }) => {
  const {
    assets,
    assetHashes,
    collectionRef,
    setCollectionRef,
    isReadyForTagging,
    folderName,
    consentedList,
  } = pipeline;

  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);

  const handleProceed = () => {
    if (!isReadyForTagging) return;
    if (onProceed) {
      onProceed();
    } else {
      setWorkspaceNotice('Collection verified and ready. Tagging Workspace unlocks in Increment 2.');
    }
  };

  return (
    <div data-testid="start-screen" className="space-y-6">
      {/* 1. Collection Folder Ingestion */}
      <FolderSection pipeline={pipeline} />

      {/* Scanned Assets Table */}
      {assets.length > 0 && <AssetTable assets={assets} assetHashes={assetHashes} />}

      {/* 2. Consented Participants List Ingestion */}
      <ListSection pipeline={pipeline} />

      {/* 3. Collection Reference & Proceed Confirmation */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
          <div className="p-2 bg-slate-100 rounded-lg text-slate-700">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">3. Collection Reference Name</h2>
            <p className="text-xs text-slate-500">
              Unique collection reference prefilled from folder name, editable before export
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <label htmlFor="collection-ref-input" className="block text-xs font-medium text-slate-700 mb-1">
              Collection Reference (<code className="font-mono text-slate-800">collection_ref</code>)
            </label>
            <input
              id="collection-ref-input"
              type="text"
              data-testid="collection-ref-input"
              value={collectionRef}
              onChange={(e) => setCollectionRef(e.target.value)}
              placeholder="e.g. sample-collection"
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
          </div>

          <div className="flex flex-col items-end space-y-2">
            <button
              type="button"
              data-testid="proceed-button"
              onClick={handleProceed}
              disabled={!isReadyForTagging}
              className="inline-flex items-center px-6 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition"
            >
              <span>Start tagging</span>
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>

            {!isReadyForTagging && (
              <p className="text-xs text-slate-400">
                {!folderName
                  ? 'Open a folder to start'
                  : !consentedList
                    ? 'Load a valid consented list to proceed'
                    : 'Awaiting folder scanning and validation'}
              </p>
            )}
          </div>
        </div>

        {workspaceNotice && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800 flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{workspaceNotice}</span>
          </div>
        )}
      </div>
    </div>
  );
};
