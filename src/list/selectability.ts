import type {
  NonSelectableReason,
  ParticipantSelectabilityResult,
  SelectabilityOptions,
} from './types';

const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

/**
 * Validates whether a timestamp string adheres strictly to ISO 8601 UTC with 'Z'.
 * Rejects local offsets (+/-HH:MM), missing 'Z', and invalid calendar dates (e.g. Feb 30).
 */
export function isValidIsoUtc(value?: string | null): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  if (!TS_RE.test(value)) {
    return false;
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return false;
  }
  // Check calendar date validity so rolling values like 2026-02-30 are rejected
  const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (!dateMatch || !dateMatch[1] || !dateMatch[2] || !dateMatch[3]) {
    return false;
  }
  const year = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10);
  const day = parseInt(dateMatch[3], 10);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
    return false;
  }
  return true;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Formats a Date object into human-readable expiry string: "consent expired <day> <month>"
 * (e.g. "consent expired 3 Nov" per app-design.md §2.2).
 */
export function formatExpiryDate(date: Date): string {
  const day = date.getUTCDate();
  const month = MONTH_NAMES[date.getUTCMonth()];
  return `consent expired ${day} ${month}`;
}

/**
 * Evaluates participant selectability against reference time (capture time or current time).
 *
 * Rules:
 * - isMinor === true -> 'minor', formattedReason: 'minor' (absolute legal gate, never selectable).
 * - referenceTime >= consentExpiresAt -> 'expired', formattedReason: 'consent expired 3 Nov'.
 * - referenceTime > listValidUntil -> 'list_expired', formattedReason: 'list expired'.
 *
 * Precedence: minor > expired > list_expired.
 * Boundaries:
 * - referenceTime === consentExpiresAt -> expired (>= operator)
 * - referenceTime === listValidUntil -> valid (> operator)
 */
export function evaluateSelectability(
  isMinor: boolean | string,
  consentExpiresAt?: string | Date | null,
  options?: SelectabilityOptions
): ParticipantSelectabilityResult {
  const allReasons: NonSelectableReason[] = [];

  // 1. Minor check (absolute invariant)
  const minorFlag =
    typeof isMinor === 'string' ? isMinor.trim().toLowerCase() === 'true' : Boolean(isMinor);
  if (minorFlag) {
    allReasons.push('minor');
  }

  // Parse reference time (defaults to current time if omitted)
  const refDate = options?.referenceTime
    ? typeof options.referenceTime === 'string'
      ? new Date(options.referenceTime)
      : options.referenceTime
    : new Date();

  // 2. Consent expiration check (captured >= expires per tools/validate_export.py:188)
  if (consentExpiresAt) {
    const expDate =
      typeof consentExpiresAt === 'string' ? new Date(consentExpiresAt) : consentExpiresAt;
    if (!isNaN(expDate.getTime()) && !isNaN(refDate.getTime())) {
      if (refDate.getTime() >= expDate.getTime()) {
        allReasons.push('expired');
      }
    }
  }

  // 3. List expiration check (captured > list_valid_until per tools/validate_export.py:191)
  if (options?.listValidUntil) {
    const validUntilDate =
      typeof options.listValidUntil === 'string'
        ? new Date(options.listValidUntil)
        : options.listValidUntil;
    if (!isNaN(validUntilDate.getTime()) && !isNaN(refDate.getTime())) {
      if (refDate.getTime() > validUntilDate.getTime()) {
        allReasons.push('list_expired');
      }
    }
  }

  const isSelectable = allReasons.length === 0;

  // Precedence: minor > expired > list_expired
  const primaryReason: NonSelectableReason | undefined = allReasons.includes('minor')
    ? 'minor'
    : allReasons.includes('expired')
    ? 'expired'
    : allReasons.includes('list_expired')
    ? 'list_expired'
    : undefined;

  let formattedReason: string | undefined;
  if (primaryReason === 'minor') {
    formattedReason = 'minor';
  } else if (primaryReason === 'expired') {
    const expDate =
      typeof consentExpiresAt === 'string' ? new Date(consentExpiresAt) : consentExpiresAt;
    formattedReason =
      expDate && !isNaN(expDate.getTime()) ? formatExpiryDate(expDate) : 'consent expired';
  } else if (primaryReason === 'list_expired') {
    formattedReason = 'list expired';
  }

  return {
    isSelectable,
    reason: primaryReason,
    allReasons,
    formattedReason,
  };
}
