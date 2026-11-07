import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConsentedList } from '../../../src/list/parser';
import { isValidIsoUtc } from '../../../src/list/selectability';
import { REQUIRED_LIST_COLUMNS, validateConsentedList } from '../../../src/list/validator';

describe('Adversarial Stress Harness: Milestone 3 Consented List Validation & Ingestion', () => {
  const SAMPLE_CSV_PATH = path.resolve(
    __dirname,
    '../../../docs/consent-tagging/examples/consented_list.sample.csv'
  );
  const sampleCsvContent = fs.readFileSync(SAMPLE_CSV_PATH, 'utf-8');

  const VALID_HEADERS = [...REQUIRED_LIST_COLUMNS];

  const makeRow = (overrides?: Partial<Record<string, string>>): Record<string, string> => ({
    project_id: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01',
    project_name: 'Synthetic gait study',
    person_id: '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1',
    consent_id: '9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101',
    display_name: 'Synthetic Person 001',
    contact_hint: '…01',
    consent_expires_at: '',
    is_minor: 'false',
    list_generated_at: '2026-11-01T04:30:00Z',
    list_valid_until: '2026-11-08T04:30:00Z',
    ...overrides,
  });

  const buildCsv = (headers: string[], rows: Record<string, string>[]): string => {
    const headerLine = headers.join(',');
    const rowLines = rows.map((r) =>
      headers
        .map((h) => {
          const val = r[h] ?? r[h.trim()] ?? '';
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(',')
    );
    return [headerLine, ...rowLines].join('\n');
  };

  // ==========================================================================
  // Challenge 1: Header & Column Challenges (L01)
  // ==========================================================================
  describe('Challenge 1: Header & Column Challenges (L01)', () => {
    it('1.1: Rejects missing each single column with exact alphabetical name', () => {
      for (const col of REQUIRED_LIST_COLUMNS) {
        const headers = VALID_HEADERS.filter((h) => h !== col);
        const rows = [makeRow()];
        const errors = validateConsentedList(headers, rows);

        expect(errors).toEqual([
          {
            code: 'L01',
            message: `consented list is missing columns: ${col}`,
          },
        ]);

        const csv = buildCsv(headers, rows);
        const parseResult = loadConsentedList(csv);
        expect(parseResult.success).toBe(false);
        if (parseResult.success) continue;
        expect(parseResult.errors).toEqual([
          {
            code: 'L01',
            message: `consented list is missing columns: ${col}`,
          },
        ]);
      }
    });

    it('1.2: Rejects multiple missing columns with exact alphabetically sorted list', () => {
      const omitted = ['project_name', 'is_minor', 'consent_expires_at'];
      const headers = VALID_HEADERS.filter((h) => !omitted.includes(h));
      const rows = [makeRow()];

      const errors = validateConsentedList(headers, rows);
      expect(errors).toEqual([
        {
          code: 'L01',
          message: 'consented list is missing columns: consent_expires_at, is_minor, project_name',
        },
      ]);
    });

    it('1.3: Rejects completely empty CSV and whitespace-only CSV', () => {
      const allSorted = [...REQUIRED_LIST_COLUMNS].sort().join(', ');

      // 1. Validator directly enforces Rule L01: exact message with all 10 columns sorted alphabetically
      const valErrors = validateConsentedList([], []);
      expect(valErrors).toEqual([
        {
          code: 'L01',
          message: `consented list is missing columns: ${allSorted}`,
        },
      ]);

      // 2. Parser refuses empty CSV whole (zero people ingested)
      const emptyCsvList = ['', '   \n\r\n\t  ', '\n\n\n'];
      for (const emptyCsv of emptyCsvList) {
        const result = loadConsentedList(emptyCsv);
        expect(result.success).toBe(false);
        if (result.success) continue;
        expect(result.errors.length).toBeGreaterThan(0);
        expect(['CSV_PARSE_ERROR', 'L01']).toContain(result.errors[0]?.code);
      }
    });

    it('1.4: Tolerates whitespace-padded headers and extra unknown columns', () => {
      const paddedHeaders = VALID_HEADERS.map((h) => `  ${h}  `);
      const headersWithExtra = [...paddedHeaders, '  extra_notes  ', 'operator_id'];
      const row = makeRow({ extra_notes: 'note1', operator_id: 'op1' });

      const errors = validateConsentedList(headersWithExtra, [row]);
      expect(errors).toEqual([]);

      const csv = buildCsv(headersWithExtra, [row]);
      const result = loadConsentedList(csv);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.totalCount).toBe(1);
    });

    it('1.5: Tolerates arbitrary header column order permutations', () => {
      const reversedHeaders = [...VALID_HEADERS].reverse();
      const row = makeRow();
      const csv = buildCsv(reversedHeaders, [row]);

      const result = loadConsentedList(csv);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.people[0]?.personId).toBe(row.person_id);
    });
  });

  // ==========================================================================
  // Challenge 2: Project ID Challenges (L02)
  // ==========================================================================
  describe('Challenge 2: Project ID Challenges (L02)', () => {
    it('2.1: Rejects 0 data rows (header only) with found 0', () => {
      const csv = VALID_HEADERS.join(',') + '\n';
      const result = loadConsentedList(csv);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors).toEqual([
        {
          code: 'L02',
          message: 'consented list must hold exactly one project_id, found 0',
        },
      ]);
    });

    it('2.2: Rejects multiple distinct project IDs with exact count (2 and 3)', () => {
      const rowA = makeRow({ project_id: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01' });
      const rowB = makeRow({
        project_id: '00000000-0000-4000-8000-000000000000',
        person_id: '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2',
      });
      const rowC = makeRow({
        project_id: '11111111-1111-4111-8111-111111111111',
        person_id: 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e03',
      });

      // 2 distinct
      const csv2 = buildCsv(VALID_HEADERS, [rowA, rowB]);
      const res2 = loadConsentedList(csv2);
      expect(res2.success).toBe(false);
      if (!res2.success) {
        expect(res2.errors).toEqual([
          {
            code: 'L02',
            message: 'consented list must hold exactly one project_id, found 2',
          },
        ]);
      }

      // 3 distinct
      const csv3 = buildCsv(VALID_HEADERS, [rowA, rowB, rowC]);
      const res3 = loadConsentedList(csv3);
      expect(res3.success).toBe(false);
      if (!res3.success) {
        expect(res3.errors).toEqual([
          {
            code: 'L02',
            message: 'consented list must hold exactly one project_id, found 3',
          },
        ]);
      }
    });

    it('2.3: Rejects mixed valid and empty string project IDs as found 2 under L02', () => {
      const rowA = makeRow({ project_id: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01' });
      const rowB = makeRow({
        project_id: '',
        person_id: '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2',
      });

      const csv = buildCsv(VALID_HEADERS, [rowA, rowB]);
      const result = loadConsentedList(csv);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors).toEqual([
        {
          code: 'L02',
          message: 'consented list must hold exactly one project_id, found 2',
        },
      ]);
    });

    it('2.4: Rejects when all rows have empty string project ID via SCHEMA_ERROR whole list refusal', () => {
      const rowA = makeRow({ project_id: '' });
      const csv = buildCsv(VALID_HEADERS, [rowA]);
      const result = loadConsentedList(csv);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors[0]?.code).toBe('SCHEMA_ERROR');
      expect(result.errors[0]?.field).toBe('project_id');
    });

    it('2.5: Rejects mixed valid and invalid UUIDs as multiple project_ids found under L02', () => {
      const rowA = makeRow({ project_id: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01' });
      const rowB = makeRow({
        project_id: 'INVALID-NOT-A-UUID',
        person_id: '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2',
      });

      const csv = buildCsv(VALID_HEADERS, [rowA, rowB]);
      const result = loadConsentedList(csv);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors).toEqual([
        {
          code: 'L02',
          message: 'consented list must hold exactly one project_id, found 2',
        },
      ]);
    });

    it('2.6: Refuses whole list when all rows hold the same invalid UUID via SCHEMA_ERROR', () => {
      const rowA = makeRow({ project_id: '6F1C2A8E-4B7D-4C1A-9E2F-3A5B7C9D1E01' }); // uppercase
      const csv = buildCsv(VALID_HEADERS, [rowA]);
      const result = loadConsentedList(csv);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors[0]?.code).toBe('SCHEMA_ERROR');
      expect(result.errors[0]?.field).toBe('project_id');
    });
  });

  // ==========================================================================
  // Challenge 3: List Validity Challenges (L03)
  // ==========================================================================
  describe('Challenge 3: List Validity Challenges (L03)', () => {
    it('3.1: Rejects differing list_valid_until between rows', () => {
      const rowA = makeRow({
        person_id: '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1',
        list_valid_until: '2026-11-08T04:30:00Z',
      });
      const rowB = makeRow({
        person_id: '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2',
        list_valid_until: '2026-11-09T04:30:00Z',
      });

      const csv = buildCsv(VALID_HEADERS, [rowA, rowB]);
      const result = loadConsentedList(csv);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors).toEqual([
        {
          code: 'L03',
          message: 'consented list must carry one valid list_valid_until on every row',
        },
      ]);
    });

    it('3.2: Rejects timestamp missing Z suffix', () => {
      const row = makeRow({ list_valid_until: '2026-11-08T04:30:00' });
      const csv = buildCsv(VALID_HEADERS, [row]);
      const result = loadConsentedList(csv);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors).toEqual([
        {
          code: 'L03',
          message: 'consented list must carry one valid list_valid_until on every row',
        },
      ]);
    });

    it('3.3: Rejects timestamp with local timezone offset (+05:30, -04:00, +00:00)', () => {
      const offsets = ['+05:30', '-04:00', '+00:00'];
      for (const off of offsets) {
        const row = makeRow({ list_valid_until: `2026-11-08T04:30:00${off}` });
        const csv = buildCsv(VALID_HEADERS, [row]);
        const result = loadConsentedList(csv);

        expect(result.success).toBe(false);
        if (result.success) continue;
        expect(result.errors).toEqual([
          {
            code: 'L03',
            message: 'consented list must carry one valid list_valid_until on every row',
          },
        ]);
      }
    });

    it('3.4: Rejects non-existent calendar dates (Feb 31, non-leap Feb 29, Apr 31, Jun 31)', () => {
      const invalidDates = [
        '2026-02-31T00:00:00Z',
        '2025-02-29T00:00:00Z',
        '2026-04-31T12:00:00Z',
        '2026-06-31T12:00:00Z',
      ];

      for (const badDate of invalidDates) {
        expect(isValidIsoUtc(badDate)).toBe(false);
        const row = makeRow({ list_valid_until: badDate });
        const csv = buildCsv(VALID_HEADERS, [row]);
        const result = loadConsentedList(csv);

        expect(result.success).toBe(false);
        if (result.success) continue;
        expect(result.errors).toEqual([
          {
            code: 'L03',
            message: 'consented list must carry one valid list_valid_until on every row',
          },
        ]);
      }
    });

    it('3.5: Accepts leap year Feb 29 as valid calendar date', () => {
      expect(isValidIsoUtc('2024-02-29T12:00:00Z')).toBe(true);
      const row = makeRow({ list_valid_until: '2024-02-29T12:00:00Z' });
      const csv = buildCsv(VALID_HEADERS, [row]);
      const result = loadConsentedList(csv);
      expect(result.success).toBe(true);
    });

    it('3.6: Rejects invalid hours and minutes (e.g. 25:00:00 or 12:60:00)', () => {
      const invalidTimes = ['2026-11-01T25:00:00Z', '2026-11-01T12:60:00Z'];
      for (const badTime of invalidTimes) {
        expect(isValidIsoUtc(badTime)).toBe(false);
      }
    });

    it('3.7: Accepts fractional seconds in list_valid_until', () => {
      const validSubsecond = '2026-11-08T04:30:00.123456Z';
      expect(isValidIsoUtc(validSubsecond)).toBe(true);
      const row = makeRow({ list_valid_until: validSubsecond });
      const csv = buildCsv(VALID_HEADERS, [row]);
      const result = loadConsentedList(csv);
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Challenge 4: Duplicate Person Challenges (L04)
  // ==========================================================================
  describe('Challenge 4: Duplicate Person Challenges (L04)', () => {
    it('4.1: Reports exactly 1 error for 2 occurrences of same person_id', () => {
      const pid = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';
      const rows = [makeRow({ person_id: pid }), makeRow({ person_id: pid })];

      const csv = buildCsv(VALID_HEADERS, rows);
      const result = loadConsentedList(csv);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors).toEqual([
        {
          code: 'L04',
          message: `person_id ${pid} appears twice in the consented list`,
        },
      ]);
    });

    it('4.2: Reports exactly 2 errors for 3 occurrences of same person_id (matching Python parity)', () => {
      const pid = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';
      const rows = [
        makeRow({ person_id: pid }),
        makeRow({ person_id: pid }),
        makeRow({ person_id: pid }),
      ];

      const csv = buildCsv(VALID_HEADERS, rows);
      const result = loadConsentedList(csv);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toEqual([
        { code: 'L04', message: `person_id ${pid} appears twice in the consented list` },
        { code: 'L04', message: `person_id ${pid} appears twice in the consented list` },
      ]);
    });

    it('4.3: Reports separate L04 errors for multiple distinct duplicate person_ids', () => {
      const p1 = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';
      const p2 = '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2';

      const rows = [
        makeRow({ person_id: p1 }),
        makeRow({ person_id: p2 }),
        makeRow({ person_id: p1 }),
        makeRow({ person_id: p2 }),
      ];

      const csv = buildCsv(VALID_HEADERS, rows);
      const result = loadConsentedList(csv);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toEqual([
        { code: 'L04', message: `person_id ${p1} appears twice in the consented list` },
        { code: 'L04', message: `person_id ${p2} appears twice in the consented list` },
      ]);
    });

    it('4.4: Does not trigger L04 for duplicate consent_id or duplicate display_name if person_id is unique', () => {
      const rows = [
        makeRow({
          person_id: '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1',
          consent_id: '9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101',
          display_name: 'Identical Name',
        }),
        makeRow({
          person_id: '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2',
          consent_id: '9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101', // same consent_id
          display_name: 'Identical Name', // same name
        }),
      ];

      const csv = buildCsv(VALID_HEADERS, rows);
      const result = loadConsentedList(csv);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.totalCount).toBe(2);
    });
  });

  // ==========================================================================
  // Challenge 5: Priority Short-Circuit & Parsing Robustness
  // ==========================================================================
  describe('Challenge 5: Priority Short-Circuit & Parsing Robustness', () => {
    it('5.1: Strict execution short-circuit: L01 -> L02 -> L03 -> L04', () => {
      const pid = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';

      // L01 halts before L02, L03, L04
      const missingHeaders = VALID_HEADERS.filter((h) => h !== 'display_name');
      const rowBoth1and2 = [
        makeRow({
          project_id: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01',
          person_id: pid,
          list_valid_until: 'invalid-date',
        }),
        makeRow({
          project_id: '00000000-0000-4000-8000-000000000000',
          person_id: pid,
          list_valid_until: 'invalid-date',
        }),
      ];
      const resL01 = loadConsentedList(buildCsv(missingHeaders, rowBoth1and2));
      expect(resL01.success).toBe(false);
      if (!resL01.success) {
        expect(resL01.errors).toHaveLength(1);
        expect(resL01.errors[0]?.code).toBe('L01');
      }

      // L02 halts before L03, L04
      const resL02 = loadConsentedList(buildCsv(VALID_HEADERS, rowBoth1and2));
      expect(resL02.success).toBe(false);
      if (!resL02.success) {
        expect(resL02.errors).toHaveLength(1);
        expect(resL02.errors[0]?.code).toBe('L02');
      }

      // L03 halts before L04
      const rowBoth3and4 = [
        makeRow({ person_id: pid, list_valid_until: '2026-11-08T04:30:00' }), // bad date
        makeRow({ person_id: pid, list_valid_until: '2026-11-08T04:30:00' }), // duplicate
      ];
      const resL03 = loadConsentedList(buildCsv(VALID_HEADERS, rowBoth3and4));
      expect(resL03.success).toBe(false);
      if (!resL03.success) {
        expect(resL03.errors).toHaveLength(1);
        expect(resL03.errors[0]?.code).toBe('L03');
      }
    });

    it('5.2: UTF-8 BOM Gate early rejection', () => {
      const bomCsv = '\ufeff' + sampleCsvContent;
      const result = loadConsentedList(bomCsv);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors).toEqual([
        {
          code: 'BOM_NOT_ALLOWED',
          message: 'file starts with a byte-order mark; save as UTF-8 without BOM',
        },
      ]);
    });

    it('5.3: RFC 4180 complex quoting (escaped quotes, commas, multi-line values, CRLF)', () => {
      const complexRow = makeRow({
        display_name: 'John "The Runner" Doe, Jr.\nSecond Line of Name',
        contact_hint: 'ext, 123 "desk"',
      });

      // Join CSV lines with CRLF (\r\n) while preserving LF (\n) inside quoted cell
      const headerLine = VALID_HEADERS.join(',');
      const rowLine = VALID_HEADERS.map((h) => {
        const val = complexRow[h] ?? '';
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',');
      const csv = `${headerLine}\r\n${rowLine}\r\n`;

      const result = loadConsentedList(csv);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.people[0]?.displayName).toBe(
        'John "The Runner" Doe, Jr.\nSecond Line of Name'
      );
      expect(result.data.people[0]?.contactHint).toBe('ext, 123 "desk"');
    });

    it('5.4: Whole-list refusal guarantee: failure returns success=false and data=undefined', () => {
      const badCsvs = [
        sampleCsvContent.replace('project_id', 'proj_id'), // L01
        sampleCsvContent.replace('6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01', '00000000-0000-0000-0000-000000000000'), // L02
        sampleCsvContent.replace('2026-11-08T04:30:00Z', '2026-11-08T04:30:00'), // L03
        sampleCsvContent + '\n' + sampleCsvContent.split('\n')[1], // L04
        '\ufeff' + sampleCsvContent, // BOM
      ];

      for (const csv of badCsvs) {
        const result = loadConsentedList(csv);
        expect(result.success).toBe(false);
        if (result.success) {
          throw new Error('Expected invalid CSV to be refused');
        }
        // @ts-expect-error Checking runtime absence of data on failure
        expect(result.data).toBeUndefined();
      }
    });

    it('5.5: Tolerates trailing empty lines without phantom rows', () => {
      const csvWithTrailing = sampleCsvContent + '\n\n   \n\r\n\r\n';
      const result = loadConsentedList(csvWithTrailing);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.totalCount).toBe(4);
    });
  });
});
