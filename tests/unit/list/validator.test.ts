import { describe, expect, it } from 'vitest';
import { REQUIRED_LIST_COLUMNS, validateConsentedList } from '../../../src/list/validator';

describe('validator: rules L01–L04 data contract enforcement', () => {
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

  describe('Rule L01: Required columns', () => {
    it('passes when all 10 required columns are present', () => {
      const rows = [makeRow()];
      const errors = validateConsentedList(VALID_HEADERS, rows);
      expect(errors).toEqual([]);
    });

    it('tolerates extra unexpected columns in header', () => {
      const headersWithExtra = [...VALID_HEADERS, 'extra_col_1', 'notes'];
      const rows = [makeRow({ extra_col_1: 'val', notes: 'test' })];
      const errors = validateConsentedList(headersWithExtra, rows);
      expect(errors).toEqual([]);
    });

    it('tolerates columns in any permuted order', () => {
      const shuffledHeaders = [...VALID_HEADERS].reverse();
      const rows = [makeRow()];
      const errors = validateConsentedList(shuffledHeaders, rows);
      expect(errors).toEqual([]);
    });

    it('rejects when single required column is missing with exact message', () => {
      const headers = VALID_HEADERS.filter((h) => h !== 'display_name');
      const rows = [makeRow()];
      const errors = validateConsentedList(headers, rows);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({
        code: 'L01',
        message: 'consented list is missing columns: display_name',
      });
    });

    it('rejects when multiple required columns are missing, sorting them alphabetically', () => {
      const headers = VALID_HEADERS.filter((h) => h !== 'is_minor' && h !== 'contact_hint');
      const rows = [makeRow()];
      const errors = validateConsentedList(headers, rows);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({
        code: 'L01',
        message: 'consented list is missing columns: contact_hint, is_minor',
      });
    });

    it('rejects empty header by listing all 10 columns alphabetically', () => {
      const errors = validateConsentedList([], []);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.code).toBe('L01');
      expect(errors[0]?.message).toBe(
        'consented list is missing columns: consent_expires_at, consent_id, contact_hint, display_name, is_minor, list_generated_at, list_valid_until, person_id, project_id, project_name'
      );
    });
  });

  describe('Rule L02: Single project_id', () => {
    it('rejects 0 data rows with found 0', () => {
      const errors = validateConsentedList(VALID_HEADERS, []);
      expect(errors).toEqual([
        {
          code: 'L02',
          message: 'consented list must hold exactly one project_id, found 0',
        },
      ]);
    });

    it('rejects rows with 2 distinct project_ids with found 2', () => {
      const rows = [
        makeRow({ project_id: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01' }),
        makeRow({
          project_id: '00000000-0000-4000-8000-000000000000',
          person_id: '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2',
        }),
      ];
      const errors = validateConsentedList(VALID_HEADERS, rows);
      expect(errors).toEqual([
        {
          code: 'L02',
          message: 'consented list must hold exactly one project_id, found 2',
        },
      ]);
    });
  });

  describe('Rule L03: Consistent & valid list_valid_until', () => {
    it('accepts identical and valid list_valid_until across rows', () => {
      const rows = [
        makeRow({ person_id: '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1' }),
        makeRow({ person_id: '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2' }),
      ];
      const errors = validateConsentedList(VALID_HEADERS, rows);
      expect(errors).toEqual([]);
    });

    it('rejects differing list_valid_until between rows', () => {
      const rows = [
        makeRow({
          person_id: '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1',
          list_valid_until: '2026-11-08T04:30:00Z',
        }),
        makeRow({
          person_id: '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2',
          list_valid_until: '2026-11-09T04:30:00Z',
        }),
      ];
      const errors = validateConsentedList(VALID_HEADERS, rows);
      expect(errors).toEqual([
        {
          code: 'L03',
          message: 'consented list must carry one valid list_valid_until on every row',
        },
      ]);
    });

    it('rejects malformed list_valid_until without Z', () => {
      const rows = [makeRow({ list_valid_until: '2026-11-08T04:30:00' })];
      const errors = validateConsentedList(VALID_HEADERS, rows);
      expect(errors).toEqual([
        {
          code: 'L03',
          message: 'consented list must carry one valid list_valid_until on every row',
        },
      ]);
    });

    it('rejects list_valid_until with local timezone offset', () => {
      const rows = [makeRow({ list_valid_until: '2026-11-08T04:30:00+05:30' })];
      const errors = validateConsentedList(VALID_HEADERS, rows);
      expect(errors).toEqual([
        {
          code: 'L03',
          message: 'consented list must carry one valid list_valid_until on every row',
        },
      ]);
    });

    it('rejects invalid calendar date in list_valid_until (e.g. Feb 30)', () => {
      const rows = [makeRow({ list_valid_until: '2026-02-30T00:00:00Z' })];
      const errors = validateConsentedList(VALID_HEADERS, rows);
      expect(errors).toEqual([
        {
          code: 'L03',
          message: 'consented list must carry one valid list_valid_until on every row',
        },
      ]);
    });

    it('accepts fractional seconds in list_valid_until', () => {
      const rows = [makeRow({ list_valid_until: '2026-11-08T04:30:00.123456Z' })];
      const errors = validateConsentedList(VALID_HEADERS, rows);
      expect(errors).toEqual([]);
    });
  });

  describe('Rule L04: Unique person_id', () => {
    it('detects a single duplicated person_id with exact error message', () => {
      const dupId = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';
      const rows = [
        makeRow({ person_id: dupId, display_name: 'Person 1' }),
        makeRow({ person_id: dupId, display_name: 'Person 1 again' }),
      ];
      const errors = validateConsentedList(VALID_HEADERS, rows);
      expect(errors).toEqual([
        {
          code: 'L04',
          message: `person_id ${dupId} appears twice in the consented list`,
        },
      ]);
    });

    it('detects multiple duplicate occurrences across rows', () => {
      const idA = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';
      const idB = '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2';
      const rows = [
        makeRow({ person_id: idA }),
        makeRow({ person_id: idB }),
        makeRow({ person_id: idA }),
        makeRow({ person_id: idB }),
      ];
      const errors = validateConsentedList(VALID_HEADERS, rows);
      expect(errors).toHaveLength(2);
      expect(errors).toEqual([
        { code: 'L04', message: `person_id ${idA} appears twice in the consented list` },
        { code: 'L04', message: `person_id ${idB} appears twice in the consented list` },
      ]);
    });

    it('reports duplicate twice when same person_id appears 3 times', () => {
      const idA = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';
      const rows = [
        makeRow({ person_id: idA }),
        makeRow({ person_id: idA }),
        makeRow({ person_id: idA }),
      ];
      const errors = validateConsentedList(VALID_HEADERS, rows);
      expect(errors).toHaveLength(2);
      expect(errors).toEqual([
        { code: 'L04', message: `person_id ${idA} appears twice in the consented list` },
        { code: 'L04', message: `person_id ${idA} appears twice in the consented list` },
      ]);
    });
  });

  describe('Short-circuit order: L01 -> L02 -> L03 -> L04', () => {
    it('halts on L01 when both missing columns and multiple project_ids exist', () => {
      const headers = VALID_HEADERS.filter((h) => h !== 'display_name');
      const rows = [
        makeRow({ project_id: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01' }),
        makeRow({ project_id: '00000000-0000-4000-8000-000000000000' }),
      ];
      const errors = validateConsentedList(headers, rows);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.code).toBe('L01');
    });

    it('halts on L02 when both multiple project_ids and inconsistent list_valid_until exist', () => {
      const rows = [
        makeRow({
          project_id: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01',
          list_valid_until: '2026-11-08T04:30:00Z',
        }),
        makeRow({
          project_id: '00000000-0000-4000-8000-000000000000',
          list_valid_until: '2026-11-09T04:30:00Z',
        }),
      ];
      const errors = validateConsentedList(VALID_HEADERS, rows);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.code).toBe('L02');
    });

    it('halts on L03 when both inconsistent list_valid_until and duplicate person_id exist', () => {
      const dupId = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';
      const rows = [
        makeRow({ person_id: dupId, list_valid_until: '2026-11-08T04:30:00Z' }),
        makeRow({ person_id: dupId, list_valid_until: '2026-11-09T04:30:00Z' }),
      ];
      const errors = validateConsentedList(VALID_HEADERS, rows);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.code).toBe('L03');
    });
  });
});
