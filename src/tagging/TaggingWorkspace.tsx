import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, HardDrive } from 'lucide-react';
import type { AggregateProgress, AssetType } from '../folder';
import type { ConsentedListResult } from '../list';
import { CenterViewerPane, type ViewerKeyboardActions } from '../viewers';
import { AssetListPane } from './AssetListPane';
import { PeoplePanel } from './PeoplePanel';
import type { TaggingWorkspaceController } from './useTaggingWorkspace';
import type { TaggingFilterStatus, TaggingFilterType } from './types';

interface TaggingWorkspaceProps {
  controller: TaggingWorkspaceController;
  consentedList: ConsentedListResult | null;
  hashingProgress: AggregateProgress;
  hashingCompleted: boolean;
  onBackToStart: () => void;
  onGoToReview?: () => void;
}

function clampWidth(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return true;
  }
  return target.isContentEditable;
}

export const TaggingWorkspace: React.FC<TaggingWorkspaceProps> = ({
  controller,
  consentedList,
  hashingProgress,
  hashingCompleted,
  onBackToStart,
  onGoToReview,
}) => {
  const {
    state,
    dispatch,
    filteredAssets,
    activeAsset,
    stats,
    fileLookup,
    saveStatus,
    flushProgress,
  } = controller;

  const [leftWidth, setLeftWidth] = useState(290);
  const [rightWidth, setRightWidth] = useState(350);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const viewerActionsRef = useRef<ViewerKeyboardActions | null>(null);
  const resizingRef = useRef<'left' | 'right' | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const activeFilteredIndex = activeAsset
    ? filteredAssets.findIndex((a) => a.assetId === activeAsset.assetId)
    : -1;

  const hasPrev = activeFilteredIndex > 0;
  const hasNext = activeFilteredIndex >= 0 && activeFilteredIndex < filteredAssets.length - 1;

  const goToPrevAsset = useCallback(() => {
    if (activeFilteredIndex > 0) {
      const target = filteredAssets[activeFilteredIndex - 1];
      if (target) {
        dispatch({ type: 'SELECT_ASSET', assetId: target.assetId });
      }
    }
  }, [activeFilteredIndex, filteredAssets, dispatch]);

  const goToNextAsset = useCallback(() => {
    if (activeFilteredIndex >= 0 && activeFilteredIndex < filteredAssets.length - 1) {
      const target = filteredAssets[activeFilteredIndex + 1];
      if (target) {
        dispatch({ type: 'SELECT_ASSET', assetId: target.assetId });
      }
    } else if (activeFilteredIndex === -1 && filteredAssets.length > 0) {
      const first = filteredAssets[0];
      if (first) {
        dispatch({ type: 'SELECT_ASSET', assetId: first.assetId });
      }
    }
  }, [activeFilteredIndex, filteredAssets, dispatch]);

  // Global keyboard map for Tagging Workspace (app-design.md §2.2 & R-17)
  useEffect(() => {
    let spaceHandled = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      const isRangeInput = e.target instanceof HTMLInputElement && e.target.type === 'range';
      if (isEditableElement(e.target) && !(isRangeInput && e.key === ' ')) {
        return;
      }

      switch (e.key) {
        case '/':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          goToPrevAsset();
          break;
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          goToNextAsset();
          break;
        case ' ':
          if (viewerActionsRef.current?.togglePlayPause) {
            e.preventDefault();
            e.stopPropagation();
            spaceHandled = true;
            viewerActionsRef.current.togglePlayPause();
          }
          break;
        case '+':
        case '=':
          if (viewerActionsRef.current?.zoomIn) {
            e.preventDefault();
            viewerActionsRef.current.zoomIn();
          }
          break;
        case '-':
        case '_':
          if (viewerActionsRef.current?.zoomOut) {
            e.preventDefault();
            viewerActionsRef.current.zoomOut();
          }
          break;
        case '0':
          if (viewerActionsRef.current?.zoomReset) {
            e.preventDefault();
            viewerActionsRef.current.zoomReset();
          }
          break;
        case 'n':
        case 'N':
          if (activeAsset) {
            e.preventDefault();
            dispatch({ type: 'TOGGLE_NO_PERSON', assetId: activeAsset.assetId });
          }
          break;
        case 'b':
        case 'B':
          if (activeAsset) {
            e.preventDefault();
            dispatch({ type: 'INCREMENT_BYSTANDER', assetId: activeAsset.assetId });
          }
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && spaceHandled) {
        e.preventDefault();
        e.stopPropagation();
        spaceHandled = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [activeAsset, dispatch, goToPrevAsset, goToNextAsset]);

  // Pane drag-resize handlers (app-design.md §2.5)
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!resizingRef.current) return;
      const dx = e.clientX - startXRef.current;
      if (resizingRef.current === 'left') {
        setLeftWidth(clampWidth(startWidthRef.current + dx, 220, 440));
      } else {
        setRightWidth(clampWidth(startWidthRef.current - dx, 260, 480));
      }
    };

    const handlePointerUp = () => {
      resizingRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const handleBack = async () => {
    await flushProgress();
    onBackToStart();
  };

  const activeFile = activeAsset ? fileLookup.get(activeAsset.assetId) ?? null : null;

  return (
    <div
      data-testid="tagging-workspace"
      className="flex flex-col flex-1 h-[calc(100vh-65px)] min-h-[640px] bg-slate-100 overflow-hidden"
    >
      {/* Workspace Action & Status Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs flex-shrink-0">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            data-testid="back-to-start-btn"
            onClick={() => void handleBack()}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Start</span>
          </button>

          {consentedList && (
            <span className="text-slate-600">
              Project: <strong className="text-slate-900">{consentedList.projectName}</strong>
            </span>
          )}
          {onGoToReview && (
            <button
              type="button"
              data-testid="go-to-review-btn"
              onClick={async () => {
                await flushProgress();
                onGoToReview();
              }}
              className="rounded border border-sky-300 bg-sky-50 px-2.5 py-1 font-medium text-sky-800 hover:bg-sky-100"
            >
              Review &amp; Save
            </button>
          )}
        </div>

        <div className="flex items-center space-x-4 text-slate-600">
          {/* Background Hashing Status */}
          <div data-testid="workspace-hashing-status" className="flex items-center space-x-1.5">
            {hashingCompleted ? (
              <span className="inline-flex items-center text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                All {stats.totalCount} hashes verified
              </span>
            ) : (
              <span className="inline-flex items-center text-sky-700">
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                Hashing {hashingProgress.completedAssets}/{hashingProgress.totalAssets} (
                {hashingProgress.overallPercent}%)
              </span>
            )}
          </div>

          <span className="text-slate-300">|</span>

          {/* Progress Auto-Save Status */}
          <div
            data-testid="progress-save-status"
            className="flex items-center space-x-1.5 font-mono text-[11px]"
          >
            <HardDrive className="w-3.5 h-3.5 text-slate-400" />
            {saveStatus === 'saving' && <span className="text-amber-700">Saving progress...</span>}
            {saveStatus === 'saved' && (
              <span className="text-emerald-700">Progress saved (.dct-progress.json)</span>
            )}
            {saveStatus === 'idle' && <span className="text-slate-500">Auto-save ready (1s)</span>}
            {saveStatus === 'error' && (
              <span className="text-slate-500" title="Directory handle read-only or mock">
                In-session state
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Three-Pane Tagging Area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AssetListPane
          assets={filteredAssets}
          activeAssetId={state.activeAssetId}
          fileLookup={fileLookup}
          stats={stats}
          statusFilter={state.statusFilter}
          typeFilter={state.typeFilter}
          searchQuery={state.assetSearchQuery}
          widthPx={leftWidth}
          onSelectAsset={(assetId) => dispatch({ type: 'SELECT_ASSET', assetId })}
          onStatusFilterChange={(filter: TaggingFilterStatus) =>
            dispatch({ type: 'SET_STATUS_FILTER', filter })
          }
          onTypeFilterChange={(filter: TaggingFilterType) =>
            dispatch({ type: 'SET_TYPE_FILTER', filter: filter as 'all' | AssetType })
          }
          onSearchQueryChange={(query) => dispatch({ type: 'SET_ASSET_SEARCH_QUERY', query })}
          onClearFilters={() => dispatch({ type: 'CLEAR_FILTERS' })}
        />

        {/* Left Resizer */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize asset list pane"
          onPointerDown={(e) => {
            resizingRef.current = 'left';
            startXRef.current = e.clientX;
            startWidthRef.current = leftWidth;
          }}
          className="w-1 bg-slate-200 hover:bg-sky-400 cursor-col-resize flex-shrink-0 transition-colors"
        />

        <CenterViewerPane
          asset={activeAsset}
          file={activeFile}
          activeIndex={activeFilteredIndex}
          totalFilteredCount={filteredAssets.length}
          hasPrev={hasPrev}
          hasNext={hasNext}
          onPrev={goToPrevAsset}
          onNext={goToNextAsset}
          onReviewedToEnd={(assetId) =>
            dispatch({ type: 'MARK_REVIEWED_TO_END', assetId })
          }
          onConfirmExternalReview={(assetId, confirmed) =>
            dispatch({ type: 'CONFIRM_EXTERNAL_REVIEW', assetId, confirmed })
          }
          onDurationKnown={(assetId, durationSeconds) =>
            dispatch({ type: 'UPDATE_DURATION', assetId, durationSeconds })
          }
          actionsRef={viewerActionsRef}
        />

        {/* Right Resizer */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize people panel"
          onPointerDown={(e) => {
            resizingRef.current = 'right';
            startXRef.current = e.clientX;
            startWidthRef.current = rightWidth;
          }}
          className="w-1 bg-slate-200 hover:bg-sky-400 cursor-col-resize flex-shrink-0 transition-colors"
        />

        <PeoplePanel
          asset={activeAsset}
          consentedList={consentedList}
          searchQuery={state.personSearchQuery}
          widthPx={rightWidth}
          searchInputRef={searchInputRef}
          onSearchQueryChange={(query) => dispatch({ type: 'SET_PERSON_SEARCH_QUERY', query })}
          onAddPerson={(personId, isSelectable) => {
            if (!activeAsset) return;
            dispatch({
              type: 'ADD_PERSON_TAG',
              assetId: activeAsset.assetId,
              personId,
              isSelectable,
            });
          }}
          onRemovePerson={(personId) => {
            if (!activeAsset) return;
            dispatch({
              type: 'REMOVE_PERSON_TAG',
              assetId: activeAsset.assetId,
              personId,
            });
          }}
          onIncrementBystander={() => {
            if (!activeAsset) return;
            dispatch({ type: 'INCREMENT_BYSTANDER', assetId: activeAsset.assetId });
          }}
          onDecrementBystander={() => {
            if (!activeAsset) return;
            dispatch({ type: 'DECREMENT_BYSTANDER', assetId: activeAsset.assetId });
          }}
          onToggleNoPerson={() => {
            if (!activeAsset) return;
            dispatch({ type: 'TOGGLE_NO_PERSON', assetId: activeAsset.assetId });
          }}
          onRequestNewList={() => void handleBack()}
        />
      </div>
    </div>
  );
};
