import type { AssetType } from '../folder/types';

export const CONTRACT_VERSION = 1 as const;

export type ListRuleCode = 'L01' | 'L02' | 'L03' | 'L04';

export type ExportRuleCode =
  | 'E01'
  | 'E02'
  | 'E03'
  | 'E04'
  | 'E05'
  | 'E06'
  | 'E07'
  | 'E08'
  | 'E09'
  | 'E10'
  | 'E11'
  | 'E12'
  | 'E13'
  | 'E14'
  | 'E15'
  | 'E16';

export type ExportWarningCode = 'W01' | 'W02';

export type InputErrorCode = 'BOM_NOT_ALLOWED' | 'CSV_PARSE_ERROR';

export type ValidationErrorCode = ListRuleCode | ExportRuleCode | InputErrorCode;

export type ValidationWarningCode = ExportWarningCode;

export type ValidationCode = ValidationErrorCode | ValidationWarningCode;

export type ExportRowType = 'person' | 'bystander' | 'no_person' | 'deleted';

export interface ExportCsvRow {
  export_id: string;
  exported_at: string;
  collection_ref: string;
  project_id: string;
  asset_id: string;
  asset_type: AssetType | string;
  captured_at: string;
  content_sha256: string;
  row_type: ExportRowType | string;
  person_id: string;
  consent_id: string;
  bystander_count: string;
}

export interface ValidationFinding {
  code: ValidationCode;
  message: string;
  line?: number; // 1-based line number in the export file (header = 1)
  assetId?: string;
}

export interface ValidationFindingJson {
  code: ValidationCode;
  message: string;
  line?: number;
  asset_id?: string;
}

export interface ValidationReportJson {
  contract_version: typeof CONTRACT_VERSION;
  valid: boolean;
  rows: number;
  assets: number;
  held_assets: string[];
  errors: ValidationFindingJson[];
  warnings: ValidationFindingJson[];
}

export interface ValidationReport {
  contractVersion: typeof CONTRACT_VERSION;
  valid: boolean;
  errors: ValidationFinding[];
  warnings: ValidationFinding[];
  rows: number;
  assets: number;
  heldAssets: string[];
  toJson: () => ValidationReportJson;
}

/**
 * Minimal identifier-only participant entry used during export validation.
 *
 * PRIVACY INVARIANT (AGENTS.md Rule 8):
 * Display names and contact hints are never stored in the validation context
 * or included in any validation finding message.
 */
export interface LoadedListPersonEntry {
  personId: string;
  consentId: string;
  consentExpiresAt: string;
  isMinor: boolean;
}

export interface LoadedListContext {
  projectId: string;
  listValidUntil: string;
  listValidUntilMicros: bigint;
  people: Map<string, LoadedListPersonEntry>;
}
