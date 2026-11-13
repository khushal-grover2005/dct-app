import { describe, expect, it } from 'vitest';
import {
  buildCorrectionFileName,
  buildCorrectionSheetPreview,
  parseDeletionRequestIds,
} from '@/corrections';
import { loadConsentedList, type ConsentedListResult } from '@/list';
import type { AssetTagState } from '@/tagging';

const SAMPLE_LIST_CSV = [
  'project_id,project_name,person_id,consent_id,display_name,contact_hint,consent_expires_at,is_minor,list_generated_at,list_valid_until',
  '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,Synthetic gait study,3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,Synthetic Person 001,…01,,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z',
  '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,Synthetic gait study,7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2,1d90a2b3-c4d5-4e6f-8a9b-0c1d2e3f0202,Synthetic Person 002,…02,2027-05-01T00:00:00Z,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z',
].join('\n');

function getConsentedList(): ConsentedListResult {
  const res = loadConsentedList(SAMPLE_LIST_CSV, {
    referenceTime: new Date('2026-11-04T06:00:00Z'),
  });
  if (!res.success) {
    throw new Error('Expected valid synthetic consented list');
  }
  return res.data;
}

describe('parseDeletionRequestIds', () => {
  it('parses lines, commas, quotes, strips csv header, and normalizes paths', () => {
    const parsed = parseDeletionRequestIds(
      'asset_id\n"IMG-0003.png"\n./day1\\IMG-0009.png, NOPE.png\nIMG-0003.png\n'
    );
    expect(parsed).toEqual(['IMG-0003.png', 'day1/IMG-0009.png', 'NOPE.png']);
  });

  it('keeps an asset literally starting cleanly if not an asset_id/path header', () => {
    expect(parseDeletionRequestIds('path\nIMG-0003.png')).toEqual(['IMG-0003.png']);
  });
});

describe('buildCorrectionFileName', () => {
  it('uses asset_export_<ref>_correction_<ts>.csv and avoids existing filename collisions', () => {
    const date = new Date('2026-11-05T12:00:00Z');
    const first = buildCorrectionFileName('LAB-A-2026-11-04-01', date);
    expect(first).toBe('asset_export_LAB-A-2026-11-04-01_correction_20261105T120000Z.csv');

    const second = buildCorrectionFileName('LAB-A-2026-11-04-01', date, new Set([first]));
    expect(second).toBe('asset_export_LAB-A-2026-11-04-01_correction_20261105T120001Z.csv');
  });
});

describe('buildCorrectionSheetPreview', () => {
  it('emits only the redacted asset person row (R-33) matching sample correction schema', () => {
    const consentedList = getConsentedList();
    const redactedAsset: AssetTagState = {
      assetId: 'IMG-0002.png',
      assetType: 'image',
      capturedAt: '2026-11-04T06:05:40Z',
      captureTimeSource: 'last_modified',
      sizeBytes: 512,
      sha256: '0caf0360f6be2f4f7510f54607c8618e09e94e98b88d8734d922d2d946e97d6f',
      personIds: ['3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1'],
      bystanderCount: 0,
      noPerson: false,
      reviewedToEnd: false,
      externalReviewConfirmed: false,
      state: 'active',
      presenceStatus: 'present',
      isHeldFromSave: false,
    };

    const preview = buildCorrectionSheetPreview(
      [redactedAsset],
      consentedList,
      'LAB-A-2026-11-04-01',
      new Date('2026-11-05T12:00:00Z'),
      '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'
    );

    expect(preview.valid).toBe(true);
    expect(preview.errors).toEqual([]);
    expect(preview.rowCount).toBe(1);
    expect(preview.correctedCount).toBe(1);
    expect(preview.deletedCount).toBe(0);
    expect(preview.fileName).toBe(
      'asset_export_LAB-A-2026-11-04-01_correction_20261105T120000Z.csv'
    );

    const lines = preview.csvText.trim().split(/\r?\n/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(
      '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e,2026-11-05T12:00:00Z,LAB-A-2026-11-04-01,6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,IMG-0002.png,image,2026-11-04T06:05:40Z,0caf0360f6be2f4f7510f54607c8618e09e94e98b88d8734d922d2d946e97d6f,person,3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,'
    );
  });

  it('emits valid deleted rows with cleared person_id, consent_id, bystander_count, and content_sha256', () => {
    const consentedList = getConsentedList();
    const deletedAsset: AssetTagState = {
      assetId: 'IMG-0003.png',
      assetType: 'image',
      capturedAt: '2026-11-04T06:20:00Z',
      captureTimeSource: 'exif',
      sizeBytes: 512,
      sha256: undefined,
      personIds: [],
      bystanderCount: 0,
      noPerson: false,
      reviewedToEnd: false,
      externalReviewConfirmed: false,
      state: 'deleted',
      presenceStatus: 'deleted',
    };

    const preview = buildCorrectionSheetPreview(
      [deletedAsset],
      consentedList,
      'LAB-A-2026-11-04-01',
      new Date('2026-11-05T12:05:00Z'),
      '2b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5f'
    );

    expect(preview.valid).toBe(true);
    expect(preview.errors).toEqual([]);
    expect(preview.rowCount).toBe(1);
    expect(preview.deletedCount).toBe(1);
    expect(preview.correctedCount).toBe(0);
    const lines = preview.csvText.trim().split(/\r?\n/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      '2b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5f,2026-11-05T12:05:00Z,LAB-A-2026-11-04-01,6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,IMG-0003.png,image,2026-11-04T06:20:00Z,,deleted,,,'
    );
  });
});
