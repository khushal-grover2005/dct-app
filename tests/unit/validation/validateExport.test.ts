import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { loadConsentedList } from '@/list/parser';
import {
  EXPORT_COLUMN_ORDER,
  type ExportCsvRow,
  parseCsvStrict,
  parseExportTimestamp,
  parseExportTimestampMicroseconds,
  validateExportCsv,
  validateExportRowsWithConsentedList,
  validateExportWithConsentedList,
} from '@/validation';

const EXAMPLES_DIR = path.resolve(__dirname, '../../../docs/consent-tagging/examples');
const LIST_PATH = path.join(EXAMPLES_DIR, 'consented_list.sample.csv');
const EXPORT_PATH = path.join(EXAMPLES_DIR, 'asset_export.sample.csv');
const CORRECTION_PATH = path.join(EXAMPLES_DIR, 'asset_export.correction.sample.csv');

const LIST_CSV = fs.readFileSync(LIST_PATH, 'utf8');
const SAMPLE_EXPORT_CSV = fs.readFileSync(EXPORT_PATH, 'utf8');
const CORRECTION_EXPORT_CSV = fs.readFileSync(CORRECTION_PATH, 'utf8');

const NOW = '2026-11-05T12:00:00Z';

const P1 = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';
const C1 = '9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101';
const C2 = '1d90a2b3-c4d5-4e6f-8a9b-0c1d2e3f0202';
const P3 = 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e03'; // consent expired 2026-11-03
const C3 = '5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f70303';
const P4 = 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f04'; // minor
const C4 = '6f7a8b9c-0d1e-4f2a-b3c4-d5e6f7080404';

function loadSampleRows(): { header: string[]; rows: Record<string, string>[] } {
  const res = parseCsvStrict(SAMPLE_EXPORT_CSV);
  if (!res.ok) {
    throw new Error(`Failed to parse sample export CSV: ${res.message}`);
  }
  return res.data;
}

function serializeCsv(header: string[], rows: Record<string, string>[]): string {
  const data = rows.map((r) => header.map((col) => r[col] ?? ''));
  return Papa.unparse({ fields: header, data }, { newline: '\n' }) + '\n';
}

function getErrorCodes(
  exportCsv: string,
  now: string | Date = NOW,
  listCsv: string = LIST_CSV
): Set<string> {
  const report = validateExportCsv(listCsv, exportCsv, now);
  return new Set(report.errors.map((e) => e.code));
}

describe('TypeScript Export Validator Unit Suite (mirrors tools/test_validate_export.py)', () => {
  describe('Samples (positive controls)', () => {
    it('validates asset_export.sample.csv and holds IMG-0002.png with W02', () => {
      const r = validateExportCsv(LIST_CSV, SAMPLE_EXPORT_CSV, NOW);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
      expect(r.heldAssets).toEqual(['IMG-0002.png']);
      expect(new Set(r.warnings.map((w) => w.code))).toContain('W02');
      expect([r.rows, r.assets]).toEqual([11, 8]);
    });

    it('validates asset_export.correction.sample.csv with 0 errors and 0 held assets', () => {
      const r = validateExportCsv(LIST_CSV, CORRECTION_EXPORT_CSV, NOW);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
      expect(r.heldAssets).toEqual([]);
      expect(r.warnings).toEqual([]);
      expect([r.rows, r.assets]).toEqual([1, 1]);
    });

    it('validates ExportCsvRow objects directly via validateExportRowsWithConsentedList', () => {
      const parsedList = loadConsentedList(LIST_CSV, { referenceTime: NOW });
      expect(parsedList.success).toBe(true);
      if (!parsedList.success) return;

      const { rows } = loadSampleRows();
      const r = validateExportRowsWithConsentedList(
        parsedList.data,
        rows as unknown as ExportCsvRow[],
        new Date(NOW)
      );
      expect(r.errors).toEqual([]);
      expect(r.heldAssets).toEqual(['IMG-0002.png']);
      expect(r.rows).toBe(11);
      expect(r.assets).toBe(8);
    });
  });

  describe('Export Rules E01–E16 & W01–W02', () => {
    const { header: sampleHeader, rows: sampleRows } = loadSampleRows();

    function mutate(index: number, changes: Record<string, string>): Set<string> {
      const nextRows = sampleRows.map((r, i) => (i === index ? { ...r, ...changes } : { ...r }));
      return getErrorCodes(serializeCsv(sampleHeader, nextRows));
    }

    function withRows(
      rows: Record<string, string>[],
      header: string[] = sampleHeader,
      now: string | Date = NOW
    ): Set<string> {
      return getErrorCodes(serializeCsv(header, rows), now);
    }

    it('E01: detects missing and unknown columns', () => {
      const missingHeader = sampleHeader.filter((h) => h !== 'consent_id');
      const missingRows = sampleRows.map((r) => {
        const copy = { ...r };
        delete copy['consent_id'];
        return copy;
      });
      expect(withRows(missingRows, missingHeader)).toContain('E01');

      const extraHeader = [...sampleHeader, 'notes'];
      const extraRows = sampleRows.map((r) => ({ ...r, notes: 'x' }));
      expect(withRows(extraRows, extraHeader)).toContain('E01');

      // Trailing extra cell on a data row without a header column
      const rawTrailing = SAMPLE_EXPORT_CSV.replace(
        'DOC-0008.pdf,document,2026-11-04T07:00:00Z,8491e3916b78e4a55b894f691ed66912a2699df2c33ceac2706d08cf4ac94aae,no_person,,,',
        'DOC-0008.pdf,document,2026-11-04T07:00:00Z,8491e3916b78e4a55b894f691ed66912a2699df2c33ceac2706d08cf4ac94aae,no_person,,,,extra'
      );
      const parsed = parseCsvStrict(rawTrailing);
      expect(parsed.ok).toBe(true);
    });

    it('E01: accepts columns in any permuted order', () => {
      const reversedHeader = [...EXPORT_COLUMN_ORDER].reverse();
      expect(withRows(sampleRows, reversedHeader)).toEqual(new Set());
    });

    it('E02: detects non-lowercase or malformed UUIDs on export_id, project_id, person_id, consent_id', () => {
      expect(mutate(0, { person_id: P1.toUpperCase() })).toContain('E02');
      expect(mutate(0, { export_id: 'NOT-A-UUID' })).toContain('E02');
      expect(mutate(0, { project_id: '6F1C2A8E-4B7D-4C1A-9E2F-3A5B7C9D1E01' })).toContain('E02');
      expect(mutate(0, { consent_id: C1.toUpperCase() })).toContain('E02');
    });

    it('E03: detects project_id mismatch against the consented list once', () => {
      const nextRows = sampleRows.map((r) => ({
        ...r,
        project_id: '00000000-0000-4000-8000-000000000000',
      }));
      const report = validateExportCsv(LIST_CSV, serializeCsv(sampleHeader, nextRows), NOW);
      const e03Findings = report.errors.filter((e) => e.code === 'E03');
      expect(e03Findings).toHaveLength(1);
      expect(e03Findings[0]?.line).toBe(2);
    });

    it('E04: detects unknown person_id not on the consented list', () => {
      expect(mutate(0, { person_id: '11111111-1111-4111-8111-111111111111' })).toContain('E04');
    });

    it('E05: detects consent_id belonging to another person', () => {
      expect(mutate(0, { consent_id: C2 })).toContain('E05');
    });

    it('E06: detects minor (is_minor = true) tagged on an asset', () => {
      expect(mutate(0, { person_id: P4, consent_id: C4 })).toContain('E06');
    });

    it('E07: detects consent expired at or before captured_at', () => {
      expect(mutate(0, { person_id: P3, consent_id: C3 })).toContain('E07');
      // Exact boundary: captured_at === consent_expires_at (2026-11-03T00:00:00Z)
      const boundaryRows = sampleRows.slice(0, 1).map((r) => ({
        ...r,
        person_id: P3,
        consent_id: C3,
        captured_at: '2026-11-03T00:00:00Z',
      }));
      expect(withRows(boundaryRows)).toContain('E07');
    });

    it('E08: detects captured_at after list_valid_until', () => {
      const rows = sampleRows.slice(0, 2).map((r) => ({
        ...r,
        captured_at: '2026-11-09T00:00:00Z',
      }));
      const later = '2026-11-10T00:00:00Z';
      expect(withRows(rows, sampleHeader, later)).toContain('E08');
    });

    it('E09: enforces row_type field combinations and non-empty asset_id', () => {
      expect(mutate(0, { consent_id: '' })).toContain('E09');
      expect(mutate(0, { person_id: '' })).toContain('E09');
      expect(mutate(0, { bystander_count: '1' })).toContain('E09');
      expect(mutate(3, { bystander_count: '0' })).toContain('E09');
      expect(mutate(3, { bystander_count: '-1' })).toContain('E09');
      expect(mutate(3, { bystander_count: '1a' })).toContain('E09');
      expect(mutate(3, { person_id: P1 })).toContain('E09');
      expect(mutate(5, { person_id: P1 })).toContain('E09');
      expect(mutate(5, { consent_id: C1 })).toContain('E09');
      expect(mutate(5, { bystander_count: '1' })).toContain('E09');
      expect(mutate(0, { row_type: 'someone' })).toContain('E09');

      // Empty asset_id reports E09 without assetId property
      const emptyAssetRows = sampleRows.map((r, i) => (i === 5 ? { ...r, asset_id: '' } : { ...r }));
      const report = validateExportCsv(LIST_CSV, serializeCsv(sampleHeader, emptyAssetRows), NOW);
      const emptyAssetFinding = report.errors.find(
        (e) => e.code === 'E09' && e.message === 'asset_id is empty'
      );
      expect(emptyAssetFinding).toBeDefined();
      expect(emptyAssetFinding?.line).toBe(7);
      expect(emptyAssetFinding?.assetId).toBeUndefined();
    });

    it('E10: detects same person_id appearing twice on an asset', () => {
      expect(mutate(1, { person_id: P1, consent_id: C1 })).toContain('E10');
    });

    it('E11: detects invalid per-asset row composition', () => {
      // no_person + deleted on IMG-0004.png
      const extraDeleted = { ...sampleRows[5]!, row_type: 'deleted' };
      expect(withRows([...sampleRows, extraDeleted])).toContain('E11');

      // second bystander row on IMG-0002.png
      const extraBystander = { ...sampleRows[3]! };
      expect(withRows([...sampleRows, extraBystander])).toContain('E11');

      // bystander row with no person row on IMG-0002.png
      const loneBystander = sampleRows.filter(
        (r) => !(r['asset_id'] === 'IMG-0002.png' && r['row_type'] === 'person')
      );
      expect(withRows(loneBystander)).toContain('E11');
    });

    it('E12: detects disallowed asset_type', () => {
      expect(mutate(5, { asset_type: 'lidar' })).toContain('E12');
    });

    it('E13: detects non-UTC/non-ISO timestamps, invalid calendar dates, and future captured_at', () => {
      expect(mutate(5, { captured_at: '2026-11-04 06:30:00' })).toContain('E13');
      expect(mutate(5, { captured_at: '2026-02-30T06:30:00Z' })).toContain('E13');
      expect(mutate(5, { captured_at: '2027-01-01T00:00:00Z' })).toContain('E13');
      expect(mutate(5, { exported_at: '2026-11-04T10:00:00+05:30' })).toContain('E13');
    });

    it('E14: detects differing export_id, exported_at, or collection_ref across rows', () => {
      expect(mutate(5, { collection_ref: 'OTHER' })).toContain('E14');
      expect(mutate(5, { exported_at: '2026-11-04T10:00:01Z' })).toContain('E14');
      expect(mutate(5, { export_id: '11111111-2222-4333-8444-555555555555' })).toContain('E14');
    });

    it('E15: detects malformed content_sha256', () => {
      expect(mutate(5, { content_sha256: 'ABC' })).toContain('E15');
      expect(
        mutate(5, {
          content_sha256: '252FAA78ECA702304CC17CBC026361D2C17607834B7869178174413A9FA3FD3C',
        })
      ).toContain('E15');
    });

    it('E16: detects rows of the same asset disagreeing on asset_type, captured_at, or content_sha256', () => {
      expect(mutate(1, { captured_at: '2026-11-04T06:02:12Z' })).toContain('E16');
      expect(mutate(1, { asset_type: 'video' })).toContain('E16');
      expect(
        mutate(1, {
          content_sha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        })
      ).toContain('E16');
    });

    it('W01: warns on empty content_sha256 for non-deleted asset without blocking validity', () => {
      const nextRows = sampleRows.map((r, i) =>
        i === 5 ? { ...r, content_sha256: '' } : { ...r }
      );
      const report = validateExportCsv(LIST_CSV, serializeCsv(sampleHeader, nextRows), NOW);
      expect(report.errors).toEqual([]);
      expect(report.valid).toBe(true);
      expect(new Set(report.warnings.map((w) => w.code))).toContain('W01');

      // Deleted row with empty content_sha256 does NOT trigger W01
      const deletedRows = sampleRows.map((r, i) =>
        i === 5 ? { ...r, row_type: 'deleted', content_sha256: '' } : { ...r }
      );
      const deletedReport = validateExportCsv(
        LIST_CSV,
        serializeCsv(sampleHeader, deletedRows),
        NOW
      );
      expect(deletedReport.errors).toEqual([]);
      expect(new Set(deletedReport.warnings.map((w) => w.code))).not.toContain('W01');
    });
  });

  describe('Consented List Rules L01–L04 & CSV Input Guards', () => {
    it('enforces L01, L02, L03, L04 short-circuit rules on list CSV', () => {
      // L01 missing column
      const l01List = LIST_CSV.replace('consent_id,', '');
      expect(getErrorCodes(SAMPLE_EXPORT_CSV, NOW, l01List)).toEqual(new Set(['L01']));

      // L02 empty rows
      const headerOnlyList = LIST_CSV.split('\n')[0] + '\n';
      expect(getErrorCodes(SAMPLE_EXPORT_CSV, NOW, headerOnlyList)).toEqual(new Set(['L02']));

      // L03 invalid list_valid_until
      const l03List = LIST_CSV.replace(/2026-11-08T04:30:00Z/g, '2026-11-08 04:30:00');
      expect(getErrorCodes(SAMPLE_EXPORT_CSV, NOW, l03List)).toEqual(new Set(['L03']));

      // L04 duplicate person_id
      const lines = LIST_CSV.trim().split('\n');
      const l04List = [...lines, lines[1]!].join('\n') + '\n';
      expect(getErrorCodes(SAMPLE_EXPORT_CSV, NOW, l04List)).toEqual(new Set(['L04']));
    });

    it('rejects UTF-8 BOM on either list CSV or export CSV with BOM_NOT_ALLOWED', () => {
      const bomListReport = validateExportCsv('\ufeff' + LIST_CSV, SAMPLE_EXPORT_CSV, NOW);
      expect(bomListReport.valid).toBe(false);
      expect(bomListReport.errors[0]?.code).toBe('BOM_NOT_ALLOWED');

      const bomExportReport = validateExportCsv(LIST_CSV, '\ufeff' + SAMPLE_EXPORT_CSV, NOW);
      expect(bomExportReport.valid).toBe(false);
      expect(bomExportReport.errors[0]?.code).toBe('BOM_NOT_ALLOWED');

      const parsedList = loadConsentedList(LIST_CSV, { referenceTime: NOW });
      if (parsedList.success) {
        const bomWithList = validateExportWithConsentedList(
          parsedList.data,
          '\ufeff' + SAMPLE_EXPORT_CSV,
          NOW
        );
        expect(bomWithList.errors[0]?.code).toBe('BOM_NOT_ALLOWED');
      }
    });

    it('parses microsecond timestamps accurately', () => {
      const t1 = parseExportTimestampMicroseconds('2026-11-04T06:02:11.000001Z');
      const t2 = parseExportTimestampMicroseconds('2026-11-04T06:02:11.000002Z');
      expect(t1).not.toBeNull();
      expect(t2).not.toBeNull();
      expect(t2! - t1!).toBe(1n);

      expect(parseExportTimestamp('2026-11-04T06:02:11Z')?.toISOString()).toBe(
        '2026-11-04T06:02:11.000Z'
      );
      expect(parseExportTimestamp('invalid')).toBeNull();
    });
  });
});
