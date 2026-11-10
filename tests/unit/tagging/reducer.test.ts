import { describe, it, expect } from 'vitest';
import type { IngestedAsset } from '@/folder';
import {
  INITIAL_TAGGING_WORKSPACE_STATE,
  MAX_BYSTANDER_COUNT,
  MIN_BYSTANDER_COUNT,
  taggingReducer,
} from '@/tagging/reducer';
import {
  computeWorkspaceStats,
  filterWorkspaceAssets,
  getAssetStatusInfo,
  getPeoplePanelPrompt,
  isAssetDone,
  isBystanderOnly,
} from '@/tagging/selectors';

function makeAsset(overrides: Partial<IngestedAsset> = {}): IngestedAsset {
  return {
    assetId: 'IMG-0001.png',
    file: new File(['bytes'], overrides.assetId ?? 'IMG-0001.png'),
    handle: {} as FileSystemFileHandle,
    assetType: 'image',
    sizeBytes: 128,
    capturedAt: '2026-11-04T06:02:11Z',
    captureTimeSource: 'last_modified',
    ...overrides,
  };
}

describe('Tagging Workspace Reducer & Selectors (R-10..R-21, R-40, R-41)', () => {
  it('syncs assets cleanly and preserves tags on background SHA-256 updates', () => {
    const a1 = makeAsset({ assetId: 'IMG-0001.png', assetType: 'image' });
    const a2 = makeAsset({ assetId: 'VID-0005.mp4', assetType: 'video' });

    let state = taggingReducer(INITIAL_TAGGING_WORKSPACE_STATE, {
      type: 'SYNC_ASSETS',
      assets: [a1, a2],
      resetTags: true,
    });

    expect(state.assets).toHaveLength(2);
    expect(state.activeAssetId).toBe('IMG-0001.png');

    state = taggingReducer(state, {
      type: 'ADD_PERSON_TAG',
      assetId: 'IMG-0001.png',
      personId: 'person-001',
    });

    // Background hash arrives
    state = taggingReducer(state, {
      type: 'SYNC_ASSETS',
      assets: [a1, a2],
      assetHashes: { 'IMG-0001.png': 'abc123' },
      resetTags: false,
    });

    expect(state.assets[0]?.sha256).toBe('abc123');
    expect(state.assets[0]?.personIds).toEqual(['person-001']);
    expect(state.activeAssetId).toBe('IMG-0001.png');
  });

  it('prevents duplicate person selection (R-14) and blocks non-selectable people', () => {
    const a1 = makeAsset({ assetId: 'IMG-0001.png' });
    let state = taggingReducer(INITIAL_TAGGING_WORKSPACE_STATE, {
      type: 'SYNC_ASSETS',
      assets: [a1],
      resetTags: true,
    });

    state = taggingReducer(state, {
      type: 'ADD_PERSON_TAG',
      assetId: 'IMG-0001.png',
      personId: 'p1',
      isSelectable: true,
    });
    // Second selection of p1 must do nothing
    state = taggingReducer(state, {
      type: 'ADD_PERSON_TAG',
      assetId: 'IMG-0001.png',
      personId: 'p1',
      isSelectable: true,
    });
    // Non-selectable person must be ignored
    state = taggingReducer(state, {
      type: 'ADD_PERSON_TAG',
      assetId: 'IMG-0001.png',
      personId: 'minor-p4',
      isSelectable: false,
    });

    expect(state.assets[0]?.personIds).toEqual(['p1']);

    // Remove and re-add works (R-16)
    state = taggingReducer(state, {
      type: 'REMOVE_PERSON_TAG',
      assetId: 'IMG-0001.png',
      personId: 'p1',
    });
    expect(state.assets[0]?.personIds).toEqual([]);

    state = taggingReducer(state, {
      type: 'ADD_PERSON_TAG',
      assetId: 'IMG-0001.png',
      personId: 'p1',
      isSelectable: true,
    });
    expect(state.assets[0]?.personIds).toEqual(['p1']);
  });

  it('enforces bystander bounds 0..20 (R-18) and mutual exclusivity with No person (R-19)', () => {
    const a1 = makeAsset({ assetId: 'IMG-0002.png' });
    let state = taggingReducer(INITIAL_TAGGING_WORKSPACE_STATE, {
      type: 'SYNC_ASSETS',
      assets: [a1],
      resetTags: true,
    });

    // Clamp bounds
    state = taggingReducer(state, { type: 'SET_BYSTANDER_COUNT', assetId: 'IMG-0002.png', count: 25 });
    expect(state.assets[0]?.bystanderCount).toBe(MAX_BYSTANDER_COUNT);

    state = taggingReducer(state, { type: 'DECREMENT_BYSTANDER', assetId: 'IMG-0002.png' });
    expect(state.assets[0]?.bystanderCount).toBe(19);

    state = taggingReducer(state, { type: 'SET_BYSTANDER_COUNT', assetId: 'IMG-0002.png', count: -3 });
    expect(state.assets[0]?.bystanderCount).toBe(MIN_BYSTANDER_COUNT);

    // Bystander = 1 -> cannot turn on No person (R-19)
    state = taggingReducer(state, { type: 'INCREMENT_BYSTANDER', assetId: 'IMG-0002.png' });
    expect(state.assets[0]?.bystanderCount).toBe(1);
    state = taggingReducer(state, { type: 'TOGGLE_NO_PERSON', assetId: 'IMG-0002.png', value: true });
    expect(state.assets[0]?.noPerson).toBe(false);

    // Clear bystanders, add person -> still cannot turn on No person (R-19)
    state = taggingReducer(state, { type: 'DECREMENT_BYSTANDER', assetId: 'IMG-0002.png' });
    state = taggingReducer(state, { type: 'ADD_PERSON_TAG', assetId: 'IMG-0002.png', personId: 'p1' });
    state = taggingReducer(state, { type: 'TOGGLE_NO_PERSON', assetId: 'IMG-0002.png', value: true });
    expect(state.assets[0]?.noPerson).toBe(false);

    // Remove person -> now No person can be enabled
    state = taggingReducer(state, { type: 'REMOVE_PERSON_TAG', assetId: 'IMG-0002.png', personId: 'p1' });
    state = taggingReducer(state, { type: 'TOGGLE_NO_PERSON', assetId: 'IMG-0002.png', value: true });
    expect(state.assets[0]?.noPerson).toBe(true);

    // While No person is ON, cannot add person or increment bystander
    state = taggingReducer(state, { type: 'ADD_PERSON_TAG', assetId: 'IMG-0002.png', personId: 'p1' });
    state = taggingReducer(state, { type: 'INCREMENT_BYSTANDER', assetId: 'IMG-0002.png' });
    expect(state.assets[0]?.personIds).toEqual([]);
    expect(state.assets[0]?.bystanderCount).toBe(0);
  });

  it('tracks bystander-only error state (R-20) and media review-to-end state (R-41)', () => {
    const img = makeAsset({ assetId: 'IMG-0002.png', assetType: 'image' });
    const vid = makeAsset({ assetId: 'VID-0005.mp4', assetType: 'video' });
    const aud = makeAsset({ assetId: 'AUD-0006.wav', assetType: 'audio' });

    let state = taggingReducer(INITIAL_TAGGING_WORKSPACE_STATE, {
      type: 'SYNC_ASSETS',
      assets: [img, vid, aud],
      resetTags: true,
    });

    // Bystander only on image
    state = taggingReducer(state, { type: 'INCREMENT_BYSTANDER', assetId: 'IMG-0002.png' });
    const imgState = state.assets[0]!;
    expect(isBystanderOnly(imgState)).toBe(true);
    expect(isAssetDone(imgState)).toBe(false);
    expect(getAssetStatusInfo(imgState).label).toBe('bystander only — delete this file');

    // Adding consented person clears bystander-only error and marks image done
    state = taggingReducer(state, { type: 'ADD_PERSON_TAG', assetId: 'IMG-0002.png', personId: 'p1' });
    expect(isBystanderOnly(state.assets[0]!)).toBe(false);
    expect(isAssetDone(state.assets[0]!)).toBe(true);
    expect(getAssetStatusInfo(state.assets[0]!).label).toBe('tagged (1)');

    // Video with person tagged BEFORE play-to-end is NOT done
    state = taggingReducer(state, { type: 'ADD_PERSON_TAG', assetId: 'VID-0005.mp4', personId: 'p2' });
    expect(isAssetDone(state.assets[1]!)).toBe(false);
    expect(getAssetStatusInfo(state.assets[1]!).label).toBe('not fully reviewed');

    // Mark video played to end -> becomes done
    state = taggingReducer(state, { type: 'MARK_REVIEWED_TO_END', assetId: 'VID-0005.mp4' });
    expect(isAssetDone(state.assets[1]!)).toBe(true);
    expect(getAssetStatusInfo(state.assets[1]!).label).toBe('tagged (1)');

    // Audio confirmed outside app + noPerson -> done
    state = taggingReducer(state, { type: 'TOGGLE_NO_PERSON', assetId: 'AUD-0006.wav', value: true });
    expect(isAssetDone(state.assets[2]!)).toBe(false);
    state = taggingReducer(state, {
      type: 'CONFIRM_EXTERNAL_REVIEW',
      assetId: 'AUD-0006.wav',
      confirmed: true,
    });
    expect(isAssetDone(state.assets[2]!)).toBe(true);
    expect(getAssetStatusInfo(state.assets[2]!).label).toBe('no person');
  });

  it('computes accurate workspace stats, filters by state and type (R-21), and provides type-specific prompts (R-40)', () => {
    const assets = [
      makeAsset({ assetId: 'IMG-0001.png', assetType: 'image' }),
      makeAsset({ assetId: 'IMG-0002.png', assetType: 'image' }),
      makeAsset({ assetId: 'VID-0005.mp4', assetType: 'video' }),
      makeAsset({ assetId: 'SNS-0007.csv', assetType: 'sensor' }),
    ];

    let state = taggingReducer(INITIAL_TAGGING_WORKSPACE_STATE, {
      type: 'SYNC_ASSETS',
      assets,
      resetTags: true,
    });

    state = taggingReducer(state, { type: 'ADD_PERSON_TAG', assetId: 'IMG-0001.png', personId: 'p1' });
    state = taggingReducer(state, { type: 'INCREMENT_BYSTANDER', assetId: 'IMG-0002.png' });
    state = taggingReducer(state, { type: 'TOGGLE_NO_PERSON', assetId: 'SNS-0007.csv', value: true });

    const stats = computeWorkspaceStats(state.assets);
    expect(stats.totalCount).toBe(4);
    expect(stats.doneCount).toBe(2); // IMG-0001 + SNS-0007
    expect(stats.bystanderOnlyCount).toBe(1);
    expect(stats.notReviewedCount).toBe(1); // VID-0005

    expect(filterWorkspaceAssets(state.assets, 'bystander_only', 'all', '')).toHaveLength(1);
    expect(filterWorkspaceAssets(state.assets, 'not_done', 'all', '')).toHaveLength(2);
    expect(filterWorkspaceAssets(state.assets, 'no_person', 'sensor', '')).toHaveLength(1);
    expect(filterWorkspaceAssets(state.assets, 'all', 'image', '0002')).toHaveLength(1);

    expect(getPeoplePanelPrompt('audio').heading).toMatch(/heard in this recording/i);
    expect(getPeoplePanelPrompt('image').heading).toMatch(/visible/i);
    expect(getPeoplePanelPrompt('video').heading).toMatch(/visible or heard/i);
    expect(getPeoplePanelPrompt('sensor').heading).toMatch(/wore or were measured/i);
    expect(getPeoplePanelPrompt('document').heading).toMatch(/named, pictured/i);
  });
});
