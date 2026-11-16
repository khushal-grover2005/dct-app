import React, { useMemo } from 'react';
import {
  Search,
  X,
  Plus,
  Minus,
  AlertTriangle,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { evaluateSelectability, type ConsentedListResult, type ConsentedPerson } from '../list';
import { MAX_BYSTANDER_COUNT, MIN_BYSTANDER_COUNT } from './reducer';
import { getPeoplePanelPrompt, isBystanderOnly } from './selectors';
import type { AssetTagState } from './types';

interface PeoplePanelProps {
  asset: AssetTagState | null;
  consentedList: ConsentedListResult | null;
  searchQuery: string;
  widthPx: number;
  searchInputRef: React.RefObject<HTMLInputElement>;
  onSearchQueryChange: (query: string) => void;
  onAddPerson: (personId: string, isSelectable: boolean) => void;
  onRemovePerson: (personId: string) => void;
  onIncrementBystander: () => void;
  onDecrementBystander: () => void;
  onToggleNoPerson: () => void;
  onRequestNewList?: () => void;
}

export const PeoplePanel: React.FC<PeoplePanelProps> = ({
  asset,
  consentedList,
  searchQuery,
  widthPx,
  searchInputRef,
  onSearchQueryChange,
  onAddPerson,
  onRemovePerson,
  onIncrementBystander,
  onDecrementBystander,
  onToggleNoPerson,
  onRequestNewList,
}) => {
  // Fast lookup map for resolving selected person chips from in-memory consentedList
  const personLookup = useMemo(() => {
    const map = new Map<string, ConsentedPerson>();
    if (consentedList) {
      for (const p of consentedList.people) {
        map.set(p.personId, p);
      }
    }
    return map;
  }, [consentedList]);

  // Evaluate live selectability for each person against THIS active asset's capture timestamp (R-10, R-11, R-12)
  const evaluatedPeople = useMemo(() => {
    if (!asset || !consentedList) {
      return [];
    }

    const q = searchQuery.trim().toLowerCase();

    return consentedList.people
      .filter((person) => {
        if (!q) return true;
        const matchName = person.displayName.toLowerCase().includes(q);
        const matchHint = person.contactHint
          ? person.contactHint.toLowerCase().includes(q)
          : false;
        return matchName || matchHint;
      })
      .map((person) => {
        const selectability = evaluateSelectability(
          person.isMinor,
          person.consentExpiresAt,
          {
            referenceTime: asset.capturedAt,
            listValidUntil: consentedList.listValidUntil,
          }
        );
        return { person, selectability };
      });
  }, [asset, consentedList, searchQuery]);

  if (!asset || !consentedList) {
    return (
      <aside
        data-testid="people-panel"
        style={{ width: `${widthPx}px` }}
        className="flex-shrink-0 bg-white border-l border-slate-200 p-6 flex items-center justify-center text-xs text-slate-500"
      >
        Load an asset and consented list to tag people.
      </aside>
    );
  }

  const prompt = getPeoplePanelPrompt(asset.assetType);
  const bystanderOnlyError = isBystanderOnly(asset);
  const isLockedLifecycleState =
    asset.state === 'deleted' || asset.presenceStatus === 'missing';
  const cannotTurnOnNoPerson =
    isLockedLifecycleState ||
    (!asset.noPerson && (asset.personIds.length > 0 || asset.bystanderCount > 0));
  const minAllowedBystander = asset.isHeldFromSave ? 1 : MIN_BYSTANDER_COUNT;
  const decrementDisabled =
    isLockedLifecycleState || asset.noPerson || asset.bystanderCount <= minAllowedBystander;

  const isAssetCapturedAfterListExpiry =
    new Date(asset.capturedAt).getTime() > new Date(consentedList.listValidUntil).getTime();

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (asset.noPerson || isLockedLifecycleState) return;
      const firstSelectable = evaluatedPeople.find(
        (entry) => entry.selectability.isSelectable && !asset.personIds.includes(entry.person.personId)
      );
      if (firstSelectable) {
        onAddPerson(firstSelectable.person.personId, true);
      }
    } else if (e.key === 'Escape') {
      if (searchQuery) {
        onSearchQueryChange('');
      } else {
        e.currentTarget.blur();
      }
    }
  };

  return (
    <aside
      data-testid="people-panel"
      style={{ width: `${widthPx}px` }}
      className="flex-shrink-0 flex flex-col bg-white border-l border-slate-200 h-full overflow-hidden"
    >
      {/* Contextual Prompt Heading (R-40, T-15) */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/70 space-y-1">
        <div className="flex items-center space-x-2 text-slate-800">
          <Users className="w-4 h-4 text-slate-600 flex-shrink-0" />
          <h2 data-testid="people-panel-heading" className="text-sm font-semibold">
            {prompt.heading}
          </h2>
        </div>
        <p data-testid="people-panel-bystander-hint" className="text-[11px] text-slate-500 leading-4">
          {prompt.bystanderHint}
        </p>
      </div>

      {/* Scrollable Inner Controls + Search Results */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLockedLifecycleState && (
          <div
            data-testid="locked-lifecycle-banner"
            role="alert"
            className="p-3 rounded-md bg-rose-50 border border-rose-300 text-xs text-rose-900"
          >
            {asset.state === 'deleted'
              ? 'This asset has been deleted. Tags cannot be edited.'
              : 'This asset is missing from the folder. Restore the file or resolve it via Corrections.'}
          </div>
        )}

        {/* R-12 Banner when asset was captured after list_valid_until */}
        {isAssetCapturedAfterListExpiry && (
          <div
            data-testid="list-expired-asset-banner"
            role="alert"
            className="p-3 rounded-md bg-rose-50 border border-rose-300 text-xs text-rose-900 space-y-2"
          >
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Consented list expired for this asset</p>
                <p className="text-rose-800 mt-0.5">
                  Captured ({asset.capturedAt}) after list validity ({consentedList.listValidUntil}).
                  Nobody can be selected — please load a newer consented list.
                </p>
              </div>
            </div>
            {onRequestNewList && (
              <button
                type="button"
                data-testid="request-newer-list-btn"
                onClick={onRequestNewList}
                className="w-full py-1.5 px-3 rounded bg-rose-700 hover:bg-rose-800 text-white font-medium text-xs transition"
              >
                Load a newer consented list
              </button>
            )}
          </div>
        )}

        {/* Selected People Chips */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Selected people ({asset.personIds.length})
            </span>
          </div>

          {asset.personIds.length === 0 ? (
            <div
              data-testid="no-selected-people-msg"
              className="text-xs text-slate-600 italic py-1.5 px-2.5 rounded bg-slate-50 border border-dashed border-slate-300"
            >
              No consented people selected yet.
            </div>
          ) : (
            <div data-testid="selected-people-chips" className="flex flex-wrap gap-1.5">
              {asset.personIds.map((personId) => {
                const person = personLookup.get(personId);
                const label = person
                  ? person.contactHint
                    ? `${person.displayName} (${person.contactHint})`
                    : person.displayName
                  : 'Participant';

                return (
                  <span
                    key={personId}
                    data-testid={`selected-person-chip-${personId}`}
                    className="inline-flex items-center space-x-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-900 border border-emerald-200"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>{label}</span>
                    {!isLockedLifecycleState && (
                      <button
                        type="button"
                        data-testid={`remove-person-btn-${personId}`}
                        onClick={() => onRemovePerson(personId)}
                        aria-label={`Remove ${person?.displayName ?? 'person'}`}
                        className="p-0.5 rounded-full hover:bg-emerald-200 text-emerald-700 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Bystanders Stepper (0-20) & Bystander-only Error Banner (R-18, R-20, R-34) */}
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-800">Others in this asset</div>
              <div className="text-[11px] text-slate-600">Bystanders (0–20) • Shortcut: b</div>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                data-testid="bystander-decrement-btn"
                onClick={onDecrementBystander}
                disabled={decrementDisabled}
                aria-label="Decrease bystanders"
                title={
                  asset.isHeldFromSave
                    ? 'Held asset bystanders can only be cleared in Corrections'
                    : 'Decrease bystanders'
                }
                className="w-7 h-7 rounded border border-slate-300 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              <span
                data-testid="bystander-count-value"
                className="w-8 text-center font-mono text-sm font-semibold text-slate-900"
              >
                {asset.bystanderCount}
              </span>

              <button
                type="button"
                data-testid="bystander-increment-btn"
                onClick={onIncrementBystander}
                disabled={
                  isLockedLifecycleState ||
                  asset.noPerson ||
                  asset.bystanderCount >= MAX_BYSTANDER_COUNT
                }
                aria-label="Increase bystanders"
                className="w-7 h-7 rounded border border-slate-300 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {asset.isHeldFromSave && asset.bystanderCount > 0 && (
            <p
              data-testid="held-bystander-lock-note"
              className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1"
            >
              Held in an earlier save. Only redaction (&quot;I redacted it&quot;) or deletion
              (&quot;I deleted it&quot;) in Corrections can clear bystanders.
            </p>
          )}

          {bystanderOnlyError && (
            <div
              data-testid="bystander-only-warning"
              role="alert"
              className="p-2.5 rounded bg-rose-50 border border-rose-300 text-xs text-rose-900 flex items-start space-x-2"
            >
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">bystander only — delete this file</p>
                <p className="text-[11px] text-rose-800 mt-0.5">
                  Assets with only bystanders are never done. Select at least one consented person
                  or delete this file.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* No Person Toggle (R-19, T-06) */}
        <div className="space-y-1">
          <button
            type="button"
            data-testid="no-person-toggle"
            aria-pressed={asset.noPerson}
            disabled={cannotTurnOnNoPerson}
            onClick={onToggleNoPerson}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs font-medium transition ${
              asset.noPerson
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed'
            }`}
          >
            <span className="flex items-center space-x-2">
              <UserX className="w-4 h-4" />
              <span>No person in this asset</span>
            </span>
            <span className="font-mono text-[11px] uppercase">
              {asset.noPerson ? 'ON' : 'OFF'}
            </span>
          </button>

          {cannotTurnOnNoPerson && !isLockedLifecycleState && (
            <p className="text-[11px] text-slate-600 px-1">
              Clear selected people and bystanders to enable &quot;No person&quot;.
            </p>
          )}
        </div>

        {/* Participant Search & Selection List (R-10..R-16, T-04, T-05) */}
        <div className="border-t border-slate-200 pt-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="participant-search-input"
              className="text-xs font-semibold text-slate-700"
            >
              Consented List ({consentedList.totalCount})
            </label>
            <span className="text-[11px] text-slate-600">Key: / to focus</span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              ref={searchInputRef}
              id="participant-search-input"
              type="search"
              data-testid="participant-search-input"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search name or contact hint..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div
            data-testid="participant-select-list"
            className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden"
          >
            {evaluatedPeople.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-600 space-y-1">
                <p>No matching participants in consented list.</p>
                <p className="text-[11px] text-slate-600">
                  Anyone not on the list cannot be added and must be counted as a bystander above.
                </p>
              </div>
            ) : (
              evaluatedPeople.map(({ person, selectability }) => {
                const alreadySelected = asset.personIds.includes(person.personId);
                const isDisabledByNoPerson = asset.noPerson || isLockedLifecycleState;

                return (
                  <div
                    key={person.personId}
                    data-testid={`people-list-row-${person.personId}`}
                    className={`px-3 py-2.5 flex items-center justify-between gap-2 ${
                      !selectability.isSelectable ? 'bg-slate-100' : 'bg-white'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-900 truncate">
                        {person.displayName}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {person.contactHint && (
                          <span className="text-[11px] text-slate-600">
                            {person.contactHint}
                          </span>
                        )}
                        {!selectability.isSelectable && selectability.formattedReason && (
                          <span
                            data-testid={`non-selectable-reason-${person.personId}`}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                              selectability.reason === 'minor'
                                ? 'bg-rose-50 text-rose-800 border-rose-200'
                                : 'bg-amber-50 text-amber-900 border-amber-200'
                            }`}
                          >
                            {selectability.formattedReason}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* R-10, R-11, R-12: Non-selectable participants must render NO Select button */}
                    {selectability.isSelectable && (
                      alreadySelected ? (
                        <span
                          data-testid={`person-already-selected-${person.personId}`}
                          className="px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0"
                        >
                          Selected
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-testid={`select-person-btn-${person.personId}`}
                          disabled={isDisabledByNoPerson}
                          onClick={(e) => {
                            onAddPerson(person.personId, true);
                            if (e.detail === 0) {
                              searchInputRef.current?.focus();
                            }
                          }}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed transition flex-shrink-0"
                        >
                          Select
                        </button>
                      )
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
