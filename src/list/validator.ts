import { isValidIsoUtc } from './selectability';
import type { ListValidationError } from './types';

export const REQUIRED_LIST_COLUMNS = [
  'project_id',
  'project_name',
  'person_id',
  'consent_id',
  'display_name',
  'contact_hint',
  'consent_expires_at',
  'is_minor',
  'list_generated_at',
  'list_valid_until',
] as const;

/**
 * Validates consented list headers and rows against rules L01–L04 in short-circuit order:
 * L01 -> L02 -> L03 -> L04.
 *
 * Rules:
 * - L01: A required list column is missing. Rejects with sorted comma-separated missing columns.
 *        Extra columns in the header are tolerated.
 * - L02: The list holds more than one project_id, or none (e.g. 0 or 2).
 * - L03: list_valid_until is missing, invalid ISO 8601 UTC with 'Z', or differs between rows.
 * - L04: The same person_id appears twice (reports all duplicates found across rows).
 *
 * PRIVACY INVARIANT: Error messages NEVER contain participant display names or contact hints.
 */
export function validateConsentedList(
  headers: string[],
  rows: Record<string, string>[]
): ListValidationError[] {
  // 1. Rule L01: Check required columns
  const headerSet = new Set(headers.map((h) => h.trim()));
  const missing = REQUIRED_LIST_COLUMNS.filter((col) => !headerSet.has(col)).sort();
  if (missing.length > 0) {
    return [
      {
        code: 'L01',
        message: `consented list is missing columns: ${missing.join(', ')}`,
      },
    ];
  }

  // 2. Rule L02: Exactly one project_id across rows
  const projects = new Set(rows.map((r) => (r.project_id ?? '').trim()));
  if (projects.size !== 1) {
    return [
      {
        code: 'L02',
        message: `consented list must hold exactly one project_id, found ${projects.size}`,
      },
    ];
  }

  // 3. Rule L03: Exactly one valid list_valid_until across all rows
  const validUntilSet = new Set(rows.map((r) => (r.list_valid_until ?? '').trim()));
  const firstValidUntil = validUntilSet.values().next().value;
  if (validUntilSet.size !== 1 || !isValidIsoUtc(firstValidUntil)) {
    return [
      {
        code: 'L03',
        message: 'consented list must carry one valid list_valid_until on every row',
      },
    ];
  }

  // 4. Rule L04: Duplicate person_id detection
  const errors: ListValidationError[] = [];
  const seenPeople = new Set<string>();
  for (const r of rows) {
    const pid = (r.person_id ?? '').trim();
    if (pid) {
      if (seenPeople.has(pid)) {
        errors.push({
          code: 'L04',
          message: `person_id ${pid} appears twice in the consented list`,
        });
      }
      seenPeople.add(pid);
    }
  }

  if (errors.length > 0) {
    return errors;
  }

  return [];
}
