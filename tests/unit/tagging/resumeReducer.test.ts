import { describe, expect, it } from 'vitest';
import type { IngestedAsset, ProgressDocument } from '@/folder';
import { loadConsentedList } from '@/list';
import {
  INITIAL_TAGGING_WORKSPACE_STATE,
  getAssetStatusInfo,
  taggingReducer,
} from '@/tagging';

function makeAsset(assetId: string, sha256: string): IngestedAsset {
  return {
    assetId,
    file: new File(['content-' + assetId], assetId),
    handle: {} as FileSystemFileHandle,
    assetType: 'image',
    sizeBytes: 256,
    sha256,
    capturedAt: '2026-11-04T06:02:11Z',
    captureTimeSource: 'exif',
  };
}

describe('Increment 4 reducer resumption & safeguards', () => {
  it('restores progress, classifies missing/untagged/changed files, and preserves tags', () => {
    const progress: ProgressDocument = {
      format: 'dct.progress',
      format_version: 1,
      collection_ref: 'LAB-A-2026-11-04-01',
      project_id: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01',
      list_generated_at: '2026-11-01T04:30:00Z',
      assets: {
        'IMG-0001.png': {
          sha256: 'a'.repeat(64),
          captured_at: '2026-11-04T06:02:11Z',
          captured_at_source: 'exif',
          asset_type: 'image',
          person_ids: ['3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1'],
          bystander_count: 0,
          no_person: false,
          reviewed_to_end: false,
          external_review_confirmed: false,
          state: 'active',
        },
        'IMG-0002.png': {
          sha256: 'b'.repeat(64),
          captured_at: '2026-11-04T06:05:40Z',
          captured_at_source: 'file_modified',
          asset_type: 'image',
          person_ids: ['3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1'],
          bystander_count: 1,
          no_person: false,
          reviewed_to_end: false,
          external_review_confirmed: false,
          state: 'active',
        },
        'IMG-0003.png': {
          sha256: 'c'.repeat(64),
          captured_at: '2026-11-04T06:20:00Z',
          captured_at_source: 'exif',
          asset_type: 'image',
          person_ids: ['7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2'],
          bystander_count: 0,
          no_person: false,
          reviewed_to_end: false,
          external_review_confirmed: false,
          state: 'active',
        },
      },
      saves: [
        {
          export_id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
          file: 'asset_export_sample.csv',
          saved_at: '2026-11-04T10:00:00Z',
          held: ['IMG-0002.png'],
        },
      ],
    };

    // Disk now has IMG-0001 (unchanged), IMG-0002 (missing), IMG-0003 (hash changed), IMG-0009 (new untagged)
    const diskAssets = [
      makeAsset('IMG-0001.png', 'a'.repeat(64)),
      makeAsset('IMG-0003.png', 'e'.repeat(64)),
      makeAsset('IMG-0009.png', 'f'.repeat(64)),
    ];

    const state = taggingReducer(INITIAL_TAGGING_WORKSPACE_STATE, {
      type: 'SYNC_ASSETS',
      assets: diskAssets,
      assetHashes: {
        'IMG-0001.png': 'a'.repeat(64),
        'IMG-0003.png': 'e'.repeat(64),
        'IMG-0009.png': 'f'.repeat(64),
      },
      progress,
    });

    const img1 = state.assets.find((a) => a.assetId === 'IMG-0001.png');
    const img2 = state.assets.find((a) => a.assetId === 'IMG-0002.png');
    const img3 = state.assets.find((a) => a.assetId === 'IMG-0003.png');
    const img9 = state.assets.find((a) => a.assetId === 'IMG-0009.png');

    expect(img1?.presenceStatus).toBe('present');
    expect(img1?.personIds).toEqual(['3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1']);

    expect(img2?.presenceStatus).toBe('missing');
    expect(img2?.isHeldFromSave).toBe(true);
    expect(getAssetStatusInfo(img2!)).toMatchObject({
      primaryStatus: 'missing',
      label: 'missing',
      variant: 'error',
      isDone: false,
    });

    expect(img3?.presenceStatus).toBe('changed');
    expect(getAssetStatusInfo(img3!)).toMatchObject({
      primaryStatus: 'changed',
      label: 'changed — check tags',
      variant: 'warning',
      isDone: false,
    });

    // Agent can confirm changed tags
    const confirmedState = taggingReducer(state, {
      type: 'CONFIRM_CHANGED_TAGS',
      assetId: 'IMG-0003.png',
    });
    const img3AfterConfirm = confirmedState.assets.find((a) => a.assetId === 'IMG-0003.png');
    expect(img3AfterConfirm?.presenceStatus).toBe('present');
    expect(getAssetStatusInfo(img3AfterConfirm!).isDone).toBe(true);

    expect(img9?.presenceStatus).toBe('untagged');
    expect(getAssetStatusInfo(img9!).primaryStatus).toBe('untagged');
  });

  it('R-34: held asset bystander count cannot drop below 1 via workspace actions, only via redaction or deletion', () => {
    const initial = taggingReducer(INITIAL_TAGGING_WORKSPACE_STATE, {
      type: 'SYNC_ASSETS',
      assets: [makeAsset('IMG-0002.png', 'b'.repeat(64))],
    });

    const tagged = taggingReducer(initial, {
      type: 'SET_BYSTANDER_COUNT',
      assetId: 'IMG-0002.png',
      count: 2,
    });

    const held = taggingReducer(tagged, {
      type: 'MARK_ASSETS_HELD_FROM_SAVE',
      assetIds: ['IMG-0002.png'],
    });
    expect(held.assets[0]?.isHeldFromSave).toBe(true);

    // Attempt decrement and direct set below 1 -> clamped at 1
    let next = taggingReducer(held, { type: 'DECREMENT_BYSTANDER', assetId: 'IMG-0002.png' });
    expect(next.assets[0]?.bystanderCount).toBe(1);
    next = taggingReducer(next, { type: 'DECREMENT_BYSTANDER', assetId: 'IMG-0002.png' });
    expect(next.assets[0]?.bystanderCount).toBe(1);
    next = taggingReducer(next, { type: 'SET_BYSTANDER_COUNT', assetId: 'IMG-0002.png', count: 0 });
    expect(next.assets[0]?.bystanderCount).toBe(1);
    next = taggingReducer(next, { type: 'TOGGLE_NO_PERSON', assetId: 'IMG-0002.png', value: true });
    expect(next.assets[0]?.bystanderCount).toBe(1);
    expect(next.assets[0]?.noPerson).toBe(false);

    // Apply redaction -> clears bystanders and unlocks
    const redacted = taggingReducer(next, {
      type: 'APPLY_ASSET_REDACTION',
      assetId: 'IMG-0002.png',
      newSha256: 'd'.repeat(64),
    });
    expect(redacted.assets[0]?.bystanderCount).toBe(0);
    expect(redacted.assets[0]?.isHeldFromSave).toBe(false);
    expect(redacted.assets[0]?.sha256).toBe('d'.repeat(64));
  });

  it('R-09: refuses a consented list whose project_id mismatches the progress file project_id', () => {
    const csv = [
      'project_id,project_name,person_id,consent_id,display_name,contact_hint,consent_expires_at,is_minor,list_generated_at,list_valid_until',
      '11111111-1111-4111-8111-111111111111,Wrong study,3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,Synthetic Person 001,…01,,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z',
    ].join('\n');

    const result = loadConsentedList(csv, {
      referenceTime: new Date('2026-11-04T06:00:00Z'),
      expectedProjectId: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((err) => err.code === 'RESUME_MISMATCH')).toBe(true);
    }
  });
});
