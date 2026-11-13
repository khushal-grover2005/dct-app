import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildExportFileName,
  buildExportSheet,
  detectFilenamePiiWarnings,
} from '@/review/sheetWriter';
import { loadConsentedList } from '@/list';
import type { AssetType } from '@/folder';
import type { AssetTagState } from '@/tagging';

const exampleDir = path.resolve(__dirname, '../../../docs/consent-tagging/examples');
const sampleListCsv = fs.readFileSync(path.join(exampleDir, 'consented_list.sample.csv'), 'utf8');
const sampleExportCsv = fs.readFileSync(path.join(exampleDir, 'asset_export.sample.csv'), 'utf8');
const EXPORT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const EXPORTED_AT = '2026-11-04T10:00:00Z';

function getSampleList() {
  const result = loadConsentedList(sampleListCsv, {
    referenceTime: '2026-11-05T12:00:00Z',
  });
  if (!result.success) {
    throw new Error('Sample consented list failed to load.');
  }
  return result.data;
}

function getSampleAssets(): AssetTagState[] {
  const parsed = Papa.parse<Record<string, string>>(sampleExportCsv, {
    header: true,
    skipEmptyLines: true,
  });
  const assets = new Map<string, AssetTagState>();
  for (const row of parsed.data) {
    let asset = assets.get(row.asset_id ?? '');
    if (!asset) {
      asset = {
        assetId: row.asset_id ?? '',
        assetType: row.asset_type as AssetType,
        capturedAt: row.captured_at ?? '',
        captureTimeSource: row.asset_type === 'video' ? 'mp4box' : 'last_modified',
        sizeBytes: 1,
        sha256: row.content_sha256,
        personIds: [],
        bystanderCount: 0,
        noPerson: false,
        reviewedToEnd: true,
        externalReviewConfirmed: false,
        state: 'active',
      };
      assets.set(asset.assetId, asset);
    }

    switch (row.row_type) {
      case 'person':
        if (row.person_id) asset.personIds.push(row.person_id);
        break;
      case 'bystander':
        asset.bystanderCount = Number(row.bystander_count);
        break;
      case 'no_person':
        asset.noPerson = true;
        break;
    }
  }
  return [...assets.values()];
}

describe('review sheet writer', () => {
  it('builds the 11 sample rows and copies consent ids from the selected people', () => {
    const sheet = buildExportSheet(
      getSampleAssets(),
      getSampleList(),
      ' LAB-A-2026-11-04-01 ',
      new Date(EXPORTED_AT),
      EXPORT_ID
    );
    const expected = Papa.parse<Record<string, string>>(sampleExportCsv, {
      header: true,
      skipEmptyLines: true,
    }).data.map((row) => ({
      ...row,
      export_id: EXPORT_ID,
      exported_at: EXPORTED_AT,
    }));

    expect(sheet.rows).toHaveLength(11);
    expect(sheet.rows).toEqual(expected);
    expect(sheet.rows.find((row) => row.person_id === '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1')?.consent_id)
      .toBe('9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101');
    expect(sheet.heldAssets).toEqual(['IMG-0002.png']);
    expect(sheet.csvText).not.toContain('\r');
    expect(sheet.csvText.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('uses the exact trimmed collection ref in the sheet and sanitizes only the filename', () => {
    expect(buildExportFileName('LAB/A:B', new Date(EXPORTED_AT))).toBe(
      'asset_export_LAB_A_B_20261104T100000Z.csv'
    );
    const sheet = buildExportSheet(
      getSampleAssets(),
      getSampleList(),
      ' LAB/A:B ',
      new Date(EXPORTED_AT),
      EXPORT_ID
    );
    expect(sheet.rows[0]?.collection_ref).toBe('LAB/A:B');
    expect(sheet.fileName).toBe('asset_export_LAB_A_B_20261104T100000Z.csv');
  });

  it('warns on participant names in active filenames without echoing the name', () => {
    const sampleAssets = getSampleAssets();
    const asset: AssetTagState = {
      ...sampleAssets[0]!,
      assetId: 'captures/Synthetic Person 001-session.png',
    };
    const nearMatch: AssetTagState = {
      ...asset,
      assetId: 'captures/Synthetic Person 0012-session.png',
    };
    const warning = detectFilenamePiiWarnings([asset, nearMatch], getSampleList());

    expect(warning).toHaveLength(1);
    expect(warning[0]?.assetId).toBe(asset.assetId);
    expect(warning[0]?.message).not.toContain('Synthetic Person 001');
  });

  it('does not warn for deleted assets or partial-word matches', () => {
    const asset = getSampleAssets()[0]!;
    const warning = detectFilenamePiiWarnings(
      [
        { ...asset, assetId: 'Synthetic Person 0012.png' },
        { ...asset, assetId: 'Synthetic Person 001.png', state: 'deleted' },
      ],
      getSampleList()
    );
    expect(warning).toEqual([]);
  });
});
