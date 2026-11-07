import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { loadConsentedList } from '../../../src/list/parser';

describe('parser: loadConsentedList integration and RFC 4180 compliance', () => {
  const SAMPLE_CSV_PATH = path.resolve(
    __dirname,
    '../../../docs/consent-tagging/examples/consented_list.sample.csv'
  );
  const sampleCsvContent = fs.readFileSync(SAMPLE_CSV_PATH, 'utf-8');

  describe('Sample CSV loading (T-03 / T-04)', () => {
    it('correctly parses 4 people and identifies exactly 2 non-selectable participants', () => {
      // Evaluated against sample capture time
      const result = loadConsentedList(sampleCsvContent, {
        referenceTime: '2026-11-04T06:02:11Z',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const { data } = result;
      expect(data.projectId).toBe('6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01');
      expect(data.projectName).toBe('Synthetic gait study');
      expect(data.totalCount).toBe(4);
      expect(data.selectableCount).toBe(2);
      expect(data.people).toHaveLength(4);

      // Person 001
      const p1 = data.people.find((p) => p.personId === '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1');
      expect(p1).toBeDefined();
      expect(p1?.displayName).toBe('Synthetic Person 001');
      expect(p1?.isMinor).toBe(false);
      expect(p1?.consentExpiresAt).toBeUndefined();
      expect(p1?.isSelectable).toBe(true);
      expect(p1?.nonSelectableReason).toBeUndefined();

      // Person 002
      const p2 = data.people.find((p) => p.personId === '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2');
      expect(p2).toBeDefined();
      expect(p2?.displayName).toBe('Synthetic Person 002');
      expect(p2?.isMinor).toBe(false);
      expect(p2?.consentExpiresAt).toBe('2027-05-01T00:00:00Z');
      expect(p2?.isSelectable).toBe(true);

      // Person 003: expired 2026-11-03
      const p3 = data.people.find((p) => p.personId === 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e03');
      expect(p3).toBeDefined();
      expect(p3?.displayName).toBe('Synthetic Person 003');
      expect(p3?.isMinor).toBe(false);
      expect(p3?.isSelectable).toBe(false);
      expect(p3?.nonSelectableReason).toBe('expired');
      expect(p3?.formattedReason).toBe('consent expired 3 Nov');

      // Person 004: minor
      const p4 = data.people.find((p) => p.personId === 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f04');
      expect(p4).toBeDefined();
      expect(p4?.displayName).toBe('Synthetic Person 004');
      expect(p4?.isMinor).toBe(true);
      expect(p4?.isSelectable).toBe(false);
      expect(p4?.nonSelectableReason).toBe('minor');
      expect(p4?.formattedReason).toBe('minor');
    });

    it('evaluates all people as non-selectable when referenceTime is after list_valid_until', () => {
      const result = loadConsentedList(sampleCsvContent, {
        referenceTime: '2026-11-09T00:00:00Z', // after list_valid_until 2026-11-08T04:30:00Z
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.selectableCount).toBe(0);
      expect(result.data.people.every((p) => !p.isSelectable)).toBe(true);
    });
  });

  describe('UTF-8 BOM Gate', () => {
    it('rejects files starting with a byte-order mark with exact contract message', () => {
      const bomContent = '\ufeff' + sampleCsvContent;
      const result = loadConsentedList(bomContent);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.errors).toEqual([
        {
          code: 'BOM_NOT_ALLOWED',
          message: 'file starts with a byte-order mark; save as UTF-8 without BOM',
        },
      ]);
    });
  });

  describe('RFC 4180 parsing compliance', () => {
    it('handles quoted commas in display names', () => {
      const csv = `project_id,project_name,person_id,consent_id,display_name,contact_hint,consent_expires_at,is_minor,list_generated_at,list_valid_until
6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,Synthetic study,3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,"Smith, John",…01,,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z`;

      const result = loadConsentedList(csv);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.people[0]?.displayName).toBe('Smith, John');
    });

    it('handles quoted quotes in display names', () => {
      const csv = `project_id,project_name,person_id,consent_id,display_name,contact_hint,consent_expires_at,is_minor,list_generated_at,list_valid_until
6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,Synthetic study,3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,"John ""The Runner"" Doe",…01,,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z`;

      const result = loadConsentedList(csv);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.people[0]?.displayName).toBe('John "The Runner" Doe');
    });

    it('handles both CRLF and LF line endings', () => {
      const crlfCsv = sampleCsvContent.replace(/\n/g, '\r\n');
      const result = loadConsentedList(crlfCsv);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.totalCount).toBe(4);
    });

    it('tolerates extra columns in the header and rows', () => {
      const extraColCsv = `project_id,project_name,person_id,consent_id,display_name,contact_hint,consent_expires_at,is_minor,list_generated_at,list_valid_until,extra_notes,operator_id
6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,Synthetic study,3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,Synthetic Person 001,…01,,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z,"extra details",OP-42`;

      const result = loadConsentedList(extraColCsv);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.totalCount).toBe(1);
    });

    it('rejects malformed CSV syntax (e.g. unclosed quote)', () => {
      const malformedCsv = `project_id,project_name,person_id,consent_id,display_name,contact_hint,consent_expires_at,is_minor,list_generated_at,list_valid_until
6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,Synthetic study,3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,"Unclosed name,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z`;

      const result = loadConsentedList(malformedCsv);
      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.errors[0]?.code).toBe('CSV_PARSE_ERROR');
    });
  });

  describe('Resume check (R-09)', () => {
    it('accepts matching expectedProjectId when resuming collection', () => {
      const result = loadConsentedList(sampleCsvContent, {
        expectedProjectId: '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01',
      });
      expect(result.success).toBe(true);
    });

    it('rejects list with RESUME_MISMATCH when expectedProjectId differs', () => {
      const differentProjectId = '00000000-0000-4000-8000-000000000000';
      const result = loadConsentedList(sampleCsvContent, {
        expectedProjectId: differentProjectId,
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.errors).toEqual([
        {
          code: 'RESUME_MISMATCH',
          message: `consented list project_id (6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01) does not match collection progress project_id (${differentProjectId})`,
        },
      ]);
    });
  });

  describe('Zod Schema validation', () => {
    it('rejects uppercase UUIDs with SCHEMA_ERROR', () => {
      const uppercaseUuidCsv = sampleCsvContent.replace(
        '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1',
        '3F1C9D2A-1B2C-4D3E-8F4A-5B6C7D8E9FA1'
      );
      const result = loadConsentedList(uppercaseUuidCsv);
      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.errors[0]?.code).toBe('SCHEMA_ERROR');
      expect(result.errors[0]?.field).toBe('person_id');
      expect(result.errors[0]?.line).toBe(2);
    });

    it('rejects non-boolean is_minor string (e.g. "maybe")', () => {
      const invalidMinorCsv = sampleCsvContent.replace('false', 'maybe');
      const result = loadConsentedList(invalidMinorCsv);
      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.errors[0]?.code).toBe('SCHEMA_ERROR');
      expect(result.errors[0]?.field).toBe('is_minor');
    });

    it('rejects empty display_name', () => {
      const emptyNameCsv = sampleCsvContent.replace('Synthetic Person 001', '');
      const result = loadConsentedList(emptyNameCsv);
      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.errors[0]?.code).toBe('SCHEMA_ERROR');
      expect(result.errors[0]?.field).toBe('display_name');
    });

    it('rejects invalid timestamp format in list_generated_at', () => {
      const badTimestampCsv = sampleCsvContent.replace(
        '2026-11-01T04:30:00Z',
        '2026-11-01 04:30:00'
      );
      const result = loadConsentedList(badTimestampCsv);
      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.errors[0]?.code).toBe('SCHEMA_ERROR');
      expect(result.errors[0]?.field).toBe('list_generated_at');
    });
  });
});
