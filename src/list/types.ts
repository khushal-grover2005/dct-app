/**
 * Types and interfaces for consented list parsing, validation, and selectability.
 *
 * IN-MEMORY PRIVACY INVARIANT (AGENTS.md Rule 8):
 * Participant display names and contact hints must remain in memory only.
 * They must NEVER be written to localStorage, sessionStorage, IndexedDB, URLs,
 * application logs, or validation error messages.
 */

export type NonSelectableReason = 'minor' | 'expired' | 'list_expired' | 'revoked';

export interface ParticipantSelectabilityResult {
  isSelectable: boolean;
  reason?: NonSelectableReason;
  allReasons: NonSelectableReason[];
  formattedReason?: string;
}

export interface SelectabilityOptions {
  referenceTime?: string | Date;
  listValidUntil?: string | Date;
}

export interface ConsentedPerson {
  projectId: string;
  projectName: string;
  personId: string;
  consentId: string;
  displayName: string; // IN-MEMORY ONLY per AGENTS.md Rule 8
  contactHint?: string; // IN-MEMORY ONLY per AGENTS.md Rule 8
  consentExpiresAt?: string; // ISO 8601 UTC string or undefined
  isMinor: boolean;
  listGeneratedAt: string;
  listValidUntil: string;
  isSelectable: boolean; // computed against reference time
  nonSelectableReason?: NonSelectableReason;
  formattedReason?: string;
}

export interface ConsentedListResult {
  projectId: string;
  projectName: string;
  listGeneratedAt: string;
  listValidUntil: string;
  people: ConsentedPerson[];
  totalCount: number;
  selectableCount: number;
}

export type ListErrorCode =
  | 'L01'
  | 'L02'
  | 'L03'
  | 'L04'
  | 'CSV_PARSE_ERROR'
  | 'BOM_NOT_ALLOWED'
  | 'SCHEMA_ERROR'
  | 'RESUME_MISMATCH';

export interface ListValidationError {
  code: ListErrorCode;
  message: string;
  line?: number;
  field?: string;
}

export interface LoadListOptions {
  referenceTime?: string | Date;
  expectedProjectId?: string;
}

export type ListParseResult =
  | {
      success: true;
      data: ConsentedListResult;
      warnings?: string[];
    }
  | {
      success: false;
      errors: ListValidationError[];
    };
