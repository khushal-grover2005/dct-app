import { describe, expect, it } from 'vitest';
import {
  evaluateSelectability,
  formatExpiryDate,
  isValidIsoUtc,
} from '../../../src/list/selectability';

describe('selectability: evaluateSelectability and date utilities', () => {
  const CAPTURE_TIME = '2026-11-04T06:02:11Z';
  const LIST_VALID_UNTIL = '2026-11-08T04:30:00Z';

  describe('Sample participants from consented_list.sample.csv', () => {
    it('evaluates Person 001 as selectable (adult, no consent expiry)', () => {
      const res = evaluateSelectability(false, null, {
        referenceTime: CAPTURE_TIME,
        listValidUntil: LIST_VALID_UNTIL,
      });

      expect(res.isSelectable).toBe(true);
      expect(res.reason).toBeUndefined();
      expect(res.allReasons).toEqual([]);
      expect(res.formattedReason).toBeUndefined();
    });

    it('evaluates Person 002 as selectable (adult, future consent expiry 2027-05-01)', () => {
      const res = evaluateSelectability(false, '2027-05-01T00:00:00Z', {
        referenceTime: CAPTURE_TIME,
        listValidUntil: LIST_VALID_UNTIL,
      });

      expect(res.isSelectable).toBe(true);
      expect(res.reason).toBeUndefined();
      expect(res.allReasons).toEqual([]);
      expect(res.formattedReason).toBeUndefined();
    });

    it('evaluates Person 003 as non-selectable with expired reason (expired 2026-11-03 before capture)', () => {
      const res = evaluateSelectability(false, '2026-11-03T00:00:00Z', {
        referenceTime: CAPTURE_TIME,
        listValidUntil: LIST_VALID_UNTIL,
      });

      expect(res.isSelectable).toBe(false);
      expect(res.reason).toBe('expired');
      expect(res.allReasons).toEqual(['expired']);
      expect(res.formattedReason).toBe('consent expired 3 Nov');
    });

    it('evaluates Person 004 as non-selectable with minor reason (is_minor: true)', () => {
      const res = evaluateSelectability(true, null, {
        referenceTime: CAPTURE_TIME,
        listValidUntil: LIST_VALID_UNTIL,
      });

      expect(res.isSelectable).toBe(false);
      expect(res.reason).toBe('minor');
      expect(res.allReasons).toEqual(['minor']);
      expect(res.formattedReason).toBe('minor');
    });
  });

  describe('Boundary condition comparisons', () => {
    it('treats exact-second match with consent_expires_at as expired (>=)', () => {
      const expiresAt = '2026-11-04T06:02:11Z';
      const exactSecondRes = evaluateSelectability(false, expiresAt, {
        referenceTime: '2026-11-04T06:02:11Z',
      });
      expect(exactSecondRes.isSelectable).toBe(false);
      expect(exactSecondRes.reason).toBe('expired');

      const oneSecondEarlierRes = evaluateSelectability(false, expiresAt, {
        referenceTime: '2026-11-04T06:02:10Z',
      });
      expect(oneSecondEarlierRes.isSelectable).toBe(true);
    });

    it('treats exact-second match with list_valid_until as valid (>)', () => {
      const validUntil = '2026-11-08T04:30:00Z';
      const exactSecondRes = evaluateSelectability(false, null, {
        referenceTime: '2026-11-08T04:30:00Z',
        listValidUntil: validUntil,
      });
      expect(exactSecondRes.isSelectable).toBe(true);
      expect(exactSecondRes.reason).toBeUndefined();

      const oneSecondLaterRes = evaluateSelectability(false, null, {
        referenceTime: '2026-11-08T04:30:01Z',
        listValidUntil: validUntil,
      });
      expect(oneSecondLaterRes.isSelectable).toBe(false);
      expect(oneSecondLaterRes.reason).toBe('list_expired');
      expect(oneSecondLaterRes.formattedReason).toBe('list expired');
    });

    it('handles sub-second millisecond comparisons correctly', () => {
      const expiresAt = '2026-11-04T06:02:11.000Z';
      const res = evaluateSelectability(false, expiresAt, {
        referenceTime: '2026-11-04T06:02:11.100Z',
      });
      expect(res.isSelectable).toBe(false);
      expect(res.reason).toBe('expired');
    });
  });

  describe('Precedence rules', () => {
    it('prioritizes minor over expired consent', () => {
      const res = evaluateSelectability(true, '2026-11-03T00:00:00Z', {
        referenceTime: CAPTURE_TIME,
        listValidUntil: LIST_VALID_UNTIL,
      });

      expect(res.isSelectable).toBe(false);
      expect(res.reason).toBe('minor');
      expect(res.allReasons).toEqual(['minor', 'expired']);
      expect(res.formattedReason).toBe('minor');
    });

    it('prioritizes minor over both expired consent and expired list', () => {
      const res = evaluateSelectability(true, '2026-11-03T00:00:00Z', {
        referenceTime: '2026-11-10T00:00:00Z', // after listValidUntil
        listValidUntil: LIST_VALID_UNTIL,
      });

      expect(res.isSelectable).toBe(false);
      expect(res.reason).toBe('minor');
      expect(res.allReasons).toEqual(['minor', 'expired', 'list_expired']);
    });

    it('prioritizes expired consent over expired list', () => {
      const res = evaluateSelectability(false, '2026-11-03T00:00:00Z', {
        referenceTime: '2026-11-10T00:00:00Z', // after listValidUntil
        listValidUntil: LIST_VALID_UNTIL,
      });

      expect(res.isSelectable).toBe(false);
      expect(res.reason).toBe('expired');
      expect(res.allReasons).toEqual(['expired', 'list_expired']);
      expect(res.formattedReason).toBe('consent expired 3 Nov');
    });
  });

  describe('Boolean normalization', () => {
    it('normalizes string booleans case-insensitively', () => {
      expect(evaluateSelectability('true').isSelectable).toBe(false);
      expect(evaluateSelectability('TRUE').isSelectable).toBe(false);
      expect(evaluateSelectability('True').isSelectable).toBe(false);
      expect(evaluateSelectability('  true  ').isSelectable).toBe(false);

      expect(evaluateSelectability('false').isSelectable).toBe(true);
      expect(evaluateSelectability('FALSE').isSelectable).toBe(true);
      expect(evaluateSelectability('').isSelectable).toBe(true);
    });
  });

  describe('formatExpiryDate', () => {
    it('formats dates into "consent expired <day> <month>" format', () => {
      expect(formatExpiryDate(new Date('2026-01-01T00:00:00Z'))).toBe('consent expired 1 Jan');
      expect(formatExpiryDate(new Date('2026-08-15T00:00:00Z'))).toBe('consent expired 15 Aug');
      expect(formatExpiryDate(new Date('2026-11-03T00:00:00Z'))).toBe('consent expired 3 Nov');
      expect(formatExpiryDate(new Date('2026-12-31T23:59:59Z'))).toBe('consent expired 31 Dec');
    });
  });

  describe('isValidIsoUtc', () => {
    it('validates proper ISO 8601 UTC timestamps with Z', () => {
      expect(isValidIsoUtc('2026-11-04T06:02:11Z')).toBe(true);
      expect(isValidIsoUtc('2026-11-04T06:02:11.123Z')).toBe(true);
      expect(isValidIsoUtc('2026-11-04T06:02:11.123456Z')).toBe(true);
    });

    it('rejects timestamps without Z or with timezone offsets', () => {
      expect(isValidIsoUtc('2026-11-04T06:02:11')).toBe(false);
      expect(isValidIsoUtc('2026-11-04 06:02:11')).toBe(false);
      expect(isValidIsoUtc('2026-11-04T06:02:11+05:30')).toBe(false);
      expect(isValidIsoUtc('2026-11-04T06:02:11-04:00')).toBe(false);
      expect(isValidIsoUtc('2026-11-04T06:02:11+00:00')).toBe(false);
    });

    it('rejects invalid calendar dates that would roll over', () => {
      expect(isValidIsoUtc('2026-02-30T00:00:00Z')).toBe(false);
      expect(isValidIsoUtc('2026-04-31T00:00:00Z')).toBe(false);
      expect(isValidIsoUtc('2026-13-01T00:00:00Z')).toBe(false);
    });

    it('rejects non-strings, empty strings, and malformed strings', () => {
      expect(isValidIsoUtc('')).toBe(false);
      expect(isValidIsoUtc(null)).toBe(false);
      expect(isValidIsoUtc(undefined)).toBe(false);
      expect(isValidIsoUtc('not a date')).toBe(false);
    });
  });
});
