import React, { useState } from 'react';
import { useAppPipeline } from './useAppPipeline';
import { StartScreen } from '../ui/StartScreen';
import { TaggingWorkspace, useTaggingWorkspace } from '../tagging';
import type { TaggingWorkspaceController } from '../tagging';
import type { ConsentedListResult } from '../list';
import { ReviewScreen, useReviewExport } from '../review';

export const App: React.FC = () => {
  const pipeline = useAppPipeline();
  const [currentScreen, setCurrentScreen] = useState<'start' | 'workspace' | 'review'>('start');

  const workspaceController = useTaggingWorkspace({
    directoryHandle: pipeline.directoryHandle,
    assets: pipeline.assets,
    assetHashes: pipeline.assetHashes,
    consentedList: pipeline.consentedList,
    collectionRef: pipeline.collectionRef,
  });

  const effectiveScreen = pipeline.isReadyForTagging ? currentScreen : 'start';

  return (
    <div
      id="app-shell"
      data-testid="app-shell"
      className="min-h-screen bg-slate-50 text-slate-900 flex flex-col min-w-[1280px]"
    >
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm flex items-center justify-between flex-shrink-0">
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
          <div className="text-sm text-slate-500 font-medium">
            {effectiveScreen === 'workspace'
              ? 'Tagging Workspace'
              : effectiveScreen === 'review'
                ? 'Review & Save'
                : 'Setup & Collection'}
          </div>
        </div>
      </header>

      {effectiveScreen === 'workspace' ? (
        <main className="flex-1 flex flex-col min-h-0 w-full">
          <TaggingWorkspace
            controller={workspaceController}
            consentedList={pipeline.consentedList}
            hashingProgress={pipeline.hashingProgress}
            hashingCompleted={pipeline.hashingCompleted}
            onBackToStart={() => setCurrentScreen('start')}
            onGoToReview={() => setCurrentScreen('review')}
          />
        </main>
      ) : effectiveScreen === 'review' && pipeline.consentedList && pipeline.directoryHandle ? (
        <ReviewRoute
          controller={workspaceController}
          consentedList={pipeline.consentedList}
          collectionRef={pipeline.collectionRef}
          directoryHandle={pipeline.directoryHandle}
          hashingCompleted={pipeline.hashingCompleted}
          onBackToWorkspace={() => setCurrentScreen('workspace')}
          onBackToStart={async () => {
            await workspaceController.flushProgress();
            setCurrentScreen('start');
          }}
        />
      ) : (
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          <StartScreen pipeline={pipeline} onProceed={() => setCurrentScreen('workspace')} />
        </main>
      )}
    </div>
  );
};

interface ReviewRouteProps {
  controller: TaggingWorkspaceController;
  consentedList: ConsentedListResult;
  collectionRef: string;
  directoryHandle: FileSystemDirectoryHandle;
  hashingCompleted: boolean;
  onBackToWorkspace: () => void;
  onBackToStart: () => Promise<void>;
}

const ReviewRoute: React.FC<ReviewRouteProps> = ({
  controller,
  consentedList,
  collectionRef,
  directoryHandle,
  hashingCompleted,
  onBackToWorkspace,
  onBackToStart,
}) => {
  const review = useReviewExport({
    assets: controller.state.assets,
    consentedList,
    collectionRef,
    directoryHandle,
    hashingCompleted,
    recordSave: controller.recordSave,
  });

  return (
    <ReviewScreen
      review={review}
      onBackToWorkspace={onBackToWorkspace}
      onBackToStart={() => void onBackToStart()}
      onJumpToAsset={(assetId) => {
        controller.dispatch({ type: 'CLEAR_FILTERS' });
        controller.dispatch({ type: 'SELECT_ASSET', assetId });
        onBackToWorkspace();
      }}
    />
  );
};

export default App;
