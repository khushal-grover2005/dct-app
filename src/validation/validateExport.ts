import Papa from 'papaparse';
import type { ConsentedListResult } from '../list/types';
import {
  CONTRACT_VERSION,
  type ExportCsvRow,
  type ExportRowType,
  type LoadedListContext,
  type LoadedListPersonEntry,
  type ValidationErrorCode,
  type ValidationFinding,
  type ValidationFindingJson,
  type ValidationReport,
  type ValidationReportJson,
  type ValidationWarningCode,
} from './types';

export const LIST_COLUMN_ORDER = [
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

export const EXPORT_COLUMN_ORDER = [
  'export_id',
  'exported_at',
  'collection_ref',
  'project_id',
  'asset_id',
  'asset_type',
  'captured_at',
  'content_sha256',
  'row_type',
  'person_id',
  'consent_id',
  'bystander_count',
] as const;

export const LIST_COLUMNS: ReadonlySet<string> = new Set(LIST_COLUMN_ORDER);
export const EXPORT_COLUMNS: ReadonlySet<string> = new Set(EXPORT_COLUMN_ORDER);

export const ASSET_TYPES: ReadonlySet<string> = new Set([
  'image',
  'video',
  'audio',
  'sensor',
  'document',
  'other',
]);

export const ROW_TYPES: ReadonlySet<string> = new Set([
  'person',
  'bystander',
  'no_person',
  'deleted',
]);

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const SHA_RE = /^[0-9a-f]{64}$/;
export const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const DIGIT_RE = /^\d+$/;

const TS_PARTS_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/;

function pyRepr(value: string): string {
  if (value.includes("'") && !value.includes('"')) {
    return `"${value}"`;
  }
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Parses an ISO 8601 UTC timestamp ending in 'Z' into epoch microseconds.
 * Returns null if the format or calendar date (e.g. Feb 30) is invalid.
 * Matches Python `parse_ts` in `tools/validate_export.py` with full microsecond precision.
 */
export function parseExportTimestampMicroseconds(value: string | undefined | null): bigint | null {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const match = TS_PARTS_RE.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fracRaw = match[7] ?? '';

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const checkDate = new Date(utcMs);
  if (
    isNaN(utcMs) ||
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() + 1 !== month ||
    checkDate.getUTCDate() !== day
  ) {
    return null;
  }

  const microsFraction = fracRaw ? BigInt(fracRaw.padEnd(6, '0')) : 0n;
  return BigInt(utcMs) * 1000n + microsFraction;
}

/**
 * Parses an ISO 8601 UTC timestamp with 'Z' into a JS Date object, or null if invalid.
 */
export function parseExportTimestamp(value: string | undefined | null): Date | null {
  const micros = parseExportTimestampMicroseconds(value);
  if (micros === null) {
    return null;
  }
  return new Date(Number(micros / 1000n));
}

/**
 * Formats epoch microseconds back to Python's `datetime.isoformat().replace('+00:00', 'Z')`.
 */
function formatMicrosecondsIsoUtc(micros: bigint): string {
  const remainderMicros = ((micros % 1000000n) + 1000000n) % 1000000n;
  const epochSecondsMs = Number((micros - remainderMicros) / 1000n);
  const baseIso = new Date(epochSecondsMs).toISOString().replace(/\.\d{3}Z$/, '');
  if (remainderMicros === 0n) {
    return `${baseIso}Z`;
  }
  const fracPadded = remainderMicros.toString().padStart(6, '0');
  return `${baseIso}.${fracPadded}Z`;
}

function resolveNowMicroseconds(now?: Date | string): bigint {
  if (now === undefined) {
    return BigInt(Date.now()) * 1000n;
  }
  if (typeof now === 'string') {
    const parsed = parseExportTimestampMicroseconds(now);
    if (parsed !== null) {
      return parsed;
    }
    const fallback = new Date(now);
    if (!isNaN(fallback.getTime())) {
      return BigInt(fallback.getTime()) * 1000n;
    }
    throw new Error('--now must be ISO 8601 UTC with Z');
  }
  if (now instanceof Date && !isNaN(now.getTime())) {
    return BigInt(now.getTime()) * 1000n;
  }
  throw new Error('--now must be a valid Date or ISO 8601 UTC string');
}

interface ReportBuilder {
  errors: ValidationFinding[];
  warnings: ValidationFinding[];
  rows: number;
  assets: number;
  heldAssets: string[];
  error: (code: ValidationErrorCode, message: string, line?: number, assetId?: string) => void;
  warn: (code: ValidationWarningCode, message: string, line?: number, assetId?: string) => void;
  finalize: () => ValidationReport;
}

function createReportBuilder(): ReportBuilder {
  const errors: ValidationFinding[] = [];
  const warnings: ValidationFinding[] = [];
  const heldAssets: string[] = [];

  const builder: ReportBuilder = {
    errors,
    warnings,
    rows: 0,
    assets: 0,
    heldAssets,
    error(code, message, line, assetId) {
      const finding: ValidationFinding = { code, message };
      if (line !== undefined) {
        finding.line = line;
      }
      if (assetId !== undefined) {
        finding.assetId = assetId;
      }
      errors.push(finding);
    },
    warn(code, message, line, assetId) {
      const finding: ValidationFinding = { code, message };
      if (line !== undefined) {
        finding.line = line;
      }
      if (assetId !== undefined) {
        finding.assetId = assetId;
      }
      warnings.push(finding);
    },
    finalize(): ValidationReport {
      const toFindingJson = (f: ValidationFinding): ValidationFindingJson => {
        const out: ValidationFindingJson = {
          code: f.code,
          message: f.message,
        };
        if (f.line !== undefined) {
          out.line = f.line;
        }
        if (f.assetId !== undefined) {
          out.asset_id = f.assetId;
        }
        return out;
      };

      return {
        contractVersion: CONTRACT_VERSION,
        valid: errors.length === 0,
        errors,
        warnings,
        rows: builder.rows,
        assets: builder.assets,
        heldAssets,
        toJson(): ValidationReportJson {
          return {
            contract_version: CONTRACT_VERSION,
            valid: errors.length === 0,
            rows: builder.rows,
            assets: builder.assets,
            held_assets: [...heldAssets].sort(),
            errors: errors.map(toFindingJson),
            warnings: warnings.map(toFindingJson),
          };
        },
      };
    },
  };

  return builder;
}

export interface ParsedCsvData {
  header: string[];
  rows: Record<string, string>[];
}

/**
 * Parses CSV text identically to `read_csv` in `tools/validate_export.py`.
 * Rejects UTF-8 BOM and strips leading/trailing whitespace on headers and field values.
 */
export function parseCsvStrict(
  csvText: string
):
  | { ok: true; data: ParsedCsvData }
  | { ok: false; code: 'BOM_NOT_ALLOWED' | 'CSV_PARSE_ERROR'; message: string; line?: number } {
  if (csvText.startsWith('\ufeff')) {
    return {
      ok: false,
      code: 'BOM_NOT_ALLOWED',
      message: 'file starts with a byte-order mark; save as UTF-8 without BOM',
    };
  }

  const normalized = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (normalized.trim().length === 0) {
    return {
      ok: true,
      data: { header: [], rows: [] },
    };
  }

  const parsed = Papa.parse<string[]>(normalized, {
    header: false,
    skipEmptyLines: true,
  });

  const fatalError = parsed.errors.find((e) => e.type === 'Quotes');
  if (fatalError) {
    return {
      ok: false,
      code: 'CSV_PARSE_ERROR',
      message: fatalError.message,
      line: fatalError.row !== undefined ? fatalError.row + 1 : undefined,
    };
  }

  const rawRows = parsed.data;
  if (rawRows.length === 0) {
    return {
      ok: true,
      data: { header: [], rows: [] },
    };
  }

  const headerRow = rawRows[0] ?? [];
  const header = headerRow.map((h) => (h ?? '').trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    if (!rawRow) continue;
    // Skip completely empty line if any remained
    if (rawRow.length === 1 && rawRow[0] === '') {
      continue;
    }
    const rowObj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      const colName = header[c] ?? '';
      const cellVal = (rawRow[c] ?? '').trim();
      rowObj[colName] = cellVal;
    }
    // Mirror Python csv.DictReader restkey=None -> (k or "").strip() === ""
    if (rawRow.length > header.length) {
      const extraVal = (rawRow[header.length] ?? '').trim();
      rowObj[''] = extraVal;
    }
    rows.push(rowObj);
  }

  return {
    ok: true,
    data: { header, rows },
  };
}

/**
 * Validates and loads a consented list from parsed CSV headers and rows.
 * Implements rules L01–L04 in exact short-circuit order per `tools/validate_export.py` `load_list()`.
 */
export function loadListFromParsedCsv(
  header: readonly string[],
  rows: readonly Record<string, string>[],
  report: ReportBuilder
): LoadedListContext | null {
  const headerSet = new Set(header.map((h) => h.trim()));
  const missing = [...LIST_COLUMNS].filter((col) => !headerSet.has(col)).sort();
  if (missing.length > 0) {
    report.error('L01', `consented list is missing columns: ${missing.join(', ')}`);
    return null;
  }

  const projects = new Set<string>();
  for (const r of rows) {
    projects.add((r['project_id'] ?? '').trim());
  }
  if (projects.size !== 1) {
    report.error('L02', `consented list must hold exactly one project_id, found ${projects.size}`);
    return null;
  }

  const validUntilValues = new Set<string>();
  for (const r of rows) {
    validUntilValues.add((r['list_valid_until'] ?? '').trim());
  }
  const singleValidUntil = validUntilValues.values().next().value ?? '';
  const validUntilMicros =
    validUntilValues.size === 1 ? parseExportTimestampMicroseconds(singleValidUntil) : null;
  if (validUntilValues.size !== 1 || validUntilMicros === null) {
    report.error('L03', 'consented list must carry one valid list_valid_until on every row');
    return null;
  }

  const people = new Map<string, LoadedListPersonEntry>();
  for (const r of rows) {
    const pid = (r['person_id'] ?? '').trim();
    if (people.has(pid)) {
      report.error('L04', `person_id ${pid} appears twice in the consented list`);
    }
    people.set(pid, {
      personId: pid,
      consentId: (r['consent_id'] ?? '').trim(),
      consentExpiresAt: (r['consent_expires_at'] ?? '').trim(),
      isMinor: (r['is_minor'] ?? '').trim().toLowerCase() === 'true',
    });
  }

  if (report.errors.length > 0) {
    return null;
  }

  const projectId = projects.values().next().value ?? '';
  return {
    projectId,
    listValidUntil: formatMicrosecondsIsoUtc(validUntilMicros),
    listValidUntilMicros: validUntilMicros,
    people,
  };
}

/**
 * Converts an already-validated in-memory `ConsentedListResult` into a `LoadedListContext`
 * containing identifiers and timestamps ONLY (never display names or contact hints per Rule 8).
 */
export function createListContextFromConsentedList(
  consentedList: ConsentedListResult
): LoadedListContext | null {
  const validUntilMicros = parseExportTimestampMicroseconds(consentedList.listValidUntil);
  if (!consentedList.projectId || validUntilMicros === null) {
    return null;
  }

  const people = new Map<string, LoadedListPersonEntry>();
  for (const person of consentedList.people) {
    people.set(person.personId, {
      personId: person.personId,
      consentId: person.consentId,
      consentExpiresAt: person.consentExpiresAt ?? '',
      isMinor: Boolean(person.isMinor),
    });
  }

  return {
    projectId: consentedList.projectId,
    listValidUntil: formatMicrosecondsIsoUtc(validUntilMicros),
    listValidUntilMicros: validUntilMicros,
    people,
  };
}

/**
 * Core export validation implementing E01–E16 and W01–W02 rule-for-rule
 * from `tools/validate_export.py` lines 117–229.
 */
function runExportValidation(
  listContext: LoadedListContext,
  header: readonly string[],
  rows: readonly Record<string, string>[],
  nowMicros: bigint,
  report: ReportBuilder
): void {
  report.rows = rows.length;

  const cols = new Set(header.map((h) => h.trim()));
  const missingCols = [...EXPORT_COLUMNS].filter((c) => !cols.has(c)).sort();
  if (missingCols.length > 0) {
    report.error('E01', `missing columns: ${missingCols.join(', ')}`);
  }
  const unknownCols = [...cols].filter((c) => !EXPORT_COLUMNS.has(c)).sort();
  if (unknownCols.length > 0) {
    report.error('E01', `unknown columns: ${unknownCols.join(', ')}`);
  }
  if (report.errors.length > 0) {
    return;
  }

  // File-level constants (E14) and project (E03)
  for (const col of ['export_id', 'exported_at', 'collection_ref'] as const) {
    const values = new Set<string>();
    for (const r of rows) {
      values.add(r[col] ?? '');
    }
    if (values.size > 1) {
      const sortedValues = [...values].sort();
      report.error('E14', `${col} differs between rows: ${sortedValues.join(', ')}`);
    }
  }
  let seenProjectMismatch = false;

  const byAsset = new Map<string, Array<{ line: number; row: Record<string, string> }>>();

  for (let idx = 0; idx < rows.length; idx++) {
    const i = idx + 2; // 1-based line number in export CSV (header = 1)
    const r = rows[idx] ?? {};
    const a = r['asset_id'] ?? '';

    const assetGroup = byAsset.get(a);
    if (assetGroup) {
      assetGroup.push({ line: i, row: r });
    } else {
      byAsset.set(a, [{ line: i, row: r }]);
    }

    // Identifiers (E02, E03, E09 empty asset_id)
    for (const col of ['export_id', 'project_id'] as const) {
      const val = r[col] ?? '';
      if (!UUID_RE.test(val)) {
        report.error('E02', `${col} is not a lowercase UUID: ${pyRepr(val)}`, i, a);
      }
    }
    const rowProjectId = r['project_id'] ?? '';
    if (rowProjectId !== listContext.projectId && !seenProjectMismatch) {
      report.error(
        'E03',
        `project_id ${rowProjectId} does not match the consented list (${listContext.projectId})`,
        i,
        a
      );
      seenProjectMismatch = true;
    }
    if (!a) {
      report.error('E09', 'asset_id is empty', i);
    }

    // Timestamps (E13)
    const capturedRaw = r['captured_at'] ?? '';
    const captured = parseExportTimestampMicroseconds(capturedRaw);
    if (captured === null) {
      report.error(
        'E13',
        `captured_at is not ISO 8601 UTC with Z: ${pyRepr(capturedRaw)}`,
        i,
        a
      );
    } else if (captured > nowMicros) {
      report.error('E13', `captured_at ${capturedRaw} is in the future`, i, a);
    }

    const exportedRaw = r['exported_at'] ?? '';
    if (parseExportTimestampMicroseconds(exportedRaw) === null) {
      report.error(
        'E13',
        `exported_at is not ISO 8601 UTC with Z: ${pyRepr(exportedRaw)}`,
        i,
        a
      );
    }

    // Type and hash (E12, E15)
    const assetType = r['asset_type'] ?? '';
    if (!ASSET_TYPES.has(assetType)) {
      const allowedTypes = [...ASSET_TYPES].sort().map(pyRepr).join(', ');
      report.error(
        'E12',
        `asset_type ${pyRepr(assetType)} is not one of [${allowedTypes}]`,
        i,
        a
      );
    }

    const sha = r['content_sha256'] ?? '';
    if (sha && !SHA_RE.test(sha)) {
      report.error('E15', 'content_sha256 is not 64 lowercase hex characters', i, a);
    }

    // Row-type shape (E09) and person checks (E02, E04, E05, E06, E07, E08)
    const rt = r['row_type'] ?? '';
    const pid = r['person_id'] ?? '';
    const cid = r['consent_id'] ?? '';
    const bc = r['bystander_count'] ?? '';

    if (!ROW_TYPES.has(rt)) {
      const allowedRowTypes = [...ROW_TYPES].sort().map(pyRepr).join(', ');
      report.error('E09', `row_type ${pyRepr(rt)} is not one of [${allowedRowTypes}]`, i, a);
      continue;
    }

    if (rt === 'person') {
      if (!pid || !cid || bc) {
        report.error(
          'E09',
          'a person row needs person_id and consent_id and an empty bystander_count',
          i,
          a
        );
        continue;
      }
      for (const [col, v] of [
        ['person_id', pid],
        ['consent_id', cid],
      ] as const) {
        if (!UUID_RE.test(v)) {
          report.error('E02', `${col} is not a lowercase UUID: ${pyRepr(v)}`, i, a);
        }
      }
      const entry = listContext.people.get(pid);
      if (!entry) {
        report.error('E04', `person_id ${pid} is not on the consented list`, i, a);
        continue;
      }
      if (entry.consentId !== cid) {
        report.error('E05', `consent_id ${cid} does not belong to person_id ${pid}`, i, a);
      }
      if (entry.isMinor) {
        report.error('E06', `person_id ${pid} is a minor and cannot be tagged`, i, a);
      }
      const expires = entry.consentExpiresAt
        ? parseExportTimestampMicroseconds(entry.consentExpiresAt)
        : null;
      if (captured !== null && expires !== null && captured >= expires) {
        report.error(
          'E07',
          `consent ${cid} expired at ${entry.consentExpiresAt}, before capture`,
          i,
          a
        );
      }
      if (captured !== null && captured > listContext.listValidUntilMicros) {
        report.error(
          'E08',
          `captured_at is after the list's list_valid_until (${listContext.listValidUntil})`,
          i,
          a
        );
      }
    } else if (rt === 'bystander') {
      if (pid || cid || !DIGIT_RE.test(bc) || BigInt(bc) < 1n) {
        report.error(
          'E09',
          'a bystander row needs empty person_id and consent_id and a bystander_count of 1 or more',
          i,
          a
        );
      }
    } else {
      // no_person, deleted
      if (pid || cid || bc) {
        report.error(
          'E09',
          `a ${rt} row needs empty person_id, consent_id and bystander_count`,
          i,
          a
        );
      }
    }
  }

  // Per-asset rules (E10, E11, E16, W01, W02)
  report.assets = byAsset.size;
  for (const [a, items] of byAsset.entries()) {
    const firstItem = items[0];
    if (!firstItem) continue;
    const firstLine = firstItem.line;
    const types = items.map((item) => item.row['row_type'] ?? '');

    const solo = types.filter((t) => t === 'no_person' || t === 'deleted');
    if (solo.length > 0 && types.length > 1) {
      report.error('E11', `a ${solo[0]} row must be the only row for its asset`, firstLine, a);
    }
    const bystanderRowCount = types.filter((t) => t === 'bystander').length;
    if (bystanderRowCount > 1) {
      report.error('E11', 'more than one bystander row for the asset', firstLine, a);
    }
    if (types.includes('bystander') && !types.includes('person')) {
      report.error(
        'E11',
        'a bystander row needs at least one person row; delete a file that shows only people without consent',
        firstLine,
        a
      );
    }

    const persons = items
      .filter((item) => item.row['row_type'] === 'person' && Boolean(item.row['person_id']))
      .map((item) => item.row['person_id'] ?? '');
    const personCounts = new Map<string, number>();
    for (const p of persons) {
      personCounts.set(p, (personCounts.get(p) ?? 0) + 1);
    }
    const duplicatedPersons = [...personCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([p]) => p)
      .sort();
    for (const p of duplicatedPersons) {
      report.error('E10', `person_id ${p} appears more than once on the asset`, firstLine, a);
    }

    for (const col of ['asset_type', 'captured_at', 'content_sha256'] as const) {
      const colValues = new Set(items.map((item) => item.row[col] ?? ''));
      if (colValues.size > 1) {
        report.error('E16', `rows of the asset disagree on ${col}`, firstLine, a);
      }
    }

    if (!(firstItem.row['content_sha256'] ?? '') && !types.includes('deleted')) {
      report.warn('W01', 'content_sha256 is empty', firstLine, a);
    }
    if (types.includes('bystander')) {
      report.heldAssets.push(a);
    }
  }

  if (report.heldAssets.length > 0) {
    const sortedHeld = [...report.heldAssets].sort();
    report.warn(
      'W02',
      `${report.heldAssets.length} asset(s) carry bystander rows and will be held: ${sortedHeld.join(', ')}`
    );
  }
}

/**
 * Validates a consented list CSV text and an asset export CSV text against all rules
 * in `docs/consent-tagging/data-contract.md` §3 (`L01–L04`, `E01–E16`, `W01–W02`).
 *
 * Faithful port of `validate(list_path, export_path, now)` in `tools/validate_export.py`.
 */
export function validateExportCsv(
  listCsvText: string,
  exportCsvText: string,
  now?: Date | string
): ValidationReport {
  const nowMicros = resolveNowMicroseconds(now);
  const report = createReportBuilder();

  const parsedList = parseCsvStrict(listCsvText);
  if (!parsedList.ok) {
    report.error(parsedList.code, parsedList.message, parsedList.line);
    return report.finalize();
  }

  const listContext = loadListFromParsedCsv(
    parsedList.data.header,
    parsedList.data.rows,
    report
  );
  if (!listContext || report.errors.length > 0) {
    return report.finalize();
  }

  const parsedExport = parseCsvStrict(exportCsvText);
  if (!parsedExport.ok) {
    report.error(parsedExport.code, parsedExport.message, parsedExport.line);
    return report.finalize();
  }

  runExportValidation(
    listContext,
    parsedExport.data.header,
    parsedExport.data.rows,
    nowMicros,
    report
  );

  return report.finalize();
}

/**
 * Validates an asset export CSV text against an already-loaded `ConsentedListResult`.
 * Used by the Review screen to validate the exact serialized CSV string it will write.
 */
export function validateExportWithConsentedList(
  consentedList: ConsentedListResult,
  exportCsvText: string,
  now?: Date | string
): ValidationReport {
  const nowMicros = resolveNowMicroseconds(now);
  const report = createReportBuilder();

  const listContext = createListContextFromConsentedList(consentedList);
  if (!listContext) {
    report.error('L03', 'consented list must carry one valid list_valid_until on every row');
    return report.finalize();
  }

  const parsedExport = parseCsvStrict(exportCsvText);
  if (!parsedExport.ok) {
    report.error(parsedExport.code, parsedExport.message, parsedExport.line);
    return report.finalize();
  }

  runExportValidation(
    listContext,
    parsedExport.data.header,
    parsedExport.data.rows,
    nowMicros,
    report
  );

  return report.finalize();
}

/**
 * Validates rendered `ExportCsvRow` records directly against an in-memory `ConsentedListResult`.
 */
export function validateExportRowsWithConsentedList(
  consentedList: ConsentedListResult,
  rows: readonly ExportCsvRow[],
  now?: Date | string,
  header: readonly string[] = EXPORT_COLUMN_ORDER
): ValidationReport {
  const nowMicros = resolveNowMicroseconds(now);
  const report = createReportBuilder();

  const listContext = createListContextFromConsentedList(consentedList);
  if (!listContext) {
    report.error('L03', 'consented list must carry one valid list_valid_until on every row');
    return report.finalize();
  }

  const normalizedRows: Record<string, string>[] = rows.map((row) => ({
    export_id: (row.export_id ?? '').trim(),
    exported_at: (row.exported_at ?? '').trim(),
    collection_ref: (row.collection_ref ?? '').trim(),
    project_id: (row.project_id ?? '').trim(),
    asset_id: (row.asset_id ?? '').trim(),
    asset_type: String(row.asset_type ?? '').trim(),
    captured_at: (row.captured_at ?? '').trim(),
    content_sha256: (row.content_sha256 ?? '').trim(),
    row_type: String(row.row_type ?? '').trim() as ExportRowType,
    person_id: (row.person_id ?? '').trim(),
    consent_id: (row.consent_id ?? '').trim(),
    bystander_count: (row.bystander_count ?? '').trim(),
  }));

  runExportValidation(listContext, header, normalizedRows, nowMicros, report);
  return report.finalize();
}
