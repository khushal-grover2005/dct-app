import Papa from 'papaparse';
import { z } from 'zod';
import { evaluateSelectability, isValidIsoUtc } from './selectability';
import type {
  ConsentedListResult,
  ConsentedPerson,
  ListParseResult,
  ListValidationError,
  LoadListOptions,
} from './types';
import { validateConsentedList } from './validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const uuidSchema = z.string().trim().regex(UUID_RE, {
  message: 'Identifier must be a lowercase UUID',
});

const isMinorSchema = z
  .string()
  .trim()
  .refine(
    (val) => val.toLowerCase() === 'true' || val.toLowerCase() === 'false',
    { message: 'is_minor must be "true" or "false"' }
  )
  .transform((val) => val.toLowerCase() === 'true');

const consentExpiresAtSchema = z
  .string()
  .trim()
  .optional()
  .refine((val) => !val || isValidIsoUtc(val), {
    message: 'consent_expires_at must be empty or a valid ISO 8601 UTC timestamp with Z',
  });

const timestampSchema = z
  .string()
  .trim()
  .refine(isValidIsoUtc, {
    message: 'Timestamp must be a valid ISO 8601 UTC timestamp with Z',
  });

/**
 * Zod schema for individual consented list rows.
 * Uses .passthrough() to tolerate extra unknown columns per data contract §3.
 */
export const consentedRowSchema = z
  .object({
    project_id: uuidSchema,
    project_name: z.string().trim().min(1, { message: 'project_name cannot be empty' }),
    person_id: uuidSchema,
    consent_id: uuidSchema,
    display_name: z.string().trim().min(1, { message: 'display_name cannot be empty' }),
    contact_hint: z.string().trim().optional().default(''),
    consent_expires_at: consentExpiresAtSchema,
    is_minor: isMinorSchema,
    list_generated_at: timestampSchema,
    list_valid_until: timestampSchema,
  })
  .passthrough();

export type ValidatedConsentedRow = z.infer<typeof consentedRowSchema>;

/**
 * Loads, parses, and validates a consented list CSV.
 *
 * Process:
 * 1. Checks for UTF-8 Byte Order Mark (\ufeff) and rejects early.
 * 2. Parses RFC 4180 CSV via PapaParse with greedy whitespace/empty-line trimming.
 * 3. Enforces data contract rules L01–L04 in short-circuit order.
 * 4. Validates optional resume project consistency (RESUME_MISMATCH).
 * 5. Validates individual row types and constraints via Zod schema.
 * 6. Evaluates participant selectability against reference capture time.
 *
 * IN-MEMORY PRIVACY INVARIANT (AGENTS.md Rule 8):
 * Participant display names and contact hints remain strictly in RAM.
 * Errors report only UUIDs, line numbers, or column names.
 */
export function loadConsentedList(
  csvText: string,
  options?: LoadListOptions
): ListParseResult {
  // 1. UTF-8 BOM Gate
  if (csvText.startsWith('\ufeff')) {
    return {
      success: false,
      errors: [
        {
          code: 'BOM_NOT_ALLOWED',
          message: 'file starts with a byte-order mark; save as UTF-8 without BOM',
        },
      ],
    };
  }

  // 2. CSV parsing via PapaParse
  const parseResult = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h: string) => h.trim(),
    transform: (val: string) => val.trim(),
  });

  if (parseResult.errors.length > 0) {
    const csvErrors: ListValidationError[] = parseResult.errors.map((err) => ({
      code: 'CSV_PARSE_ERROR',
      message: err.message,
      line: err.row !== undefined ? err.row + 1 : undefined,
    }));
    return {
      success: false,
      errors: csvErrors,
    };
  }

  const headers = parseResult.meta.fields ?? [];
  const rows = parseResult.data;

  // 3. Sequential L01–L04 validation
  const validationErrors = validateConsentedList(headers, rows);
  if (validationErrors.length > 0) {
    return {
      success: false,
      errors: validationErrors,
    };
  }

  // 4. Resume check: Verify project_id matches if collection is resuming
  const firstProject = (rows[0]?.project_id ?? '').trim();
  if (options?.expectedProjectId && firstProject !== options.expectedProjectId) {
    return {
      success: false,
      errors: [
        {
          code: 'RESUME_MISMATCH',
          message: `consented list project_id (${firstProject}) does not match collection progress project_id (${options.expectedProjectId})`,
        },
      ],
    };
  }

  // 5. Zod schema validation per row
  const schemaErrors: ListValidationError[] = [];
  const validatedRows: ValidatedConsentedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowResult = consentedRowSchema.safeParse(rows[i]);
    if (!rowResult.success) {
      for (const issue of rowResult.error.issues) {
        const field = issue.path.join('.');
        schemaErrors.push({
          code: 'SCHEMA_ERROR',
          message: `Row ${i + 2}: ${field ? `${field} - ` : ''}${issue.message}`,
          line: i + 2,
          field: field || undefined,
        });
      }
    } else {
      validatedRows.push(rowResult.data);
    }
  }

  if (schemaErrors.length > 0) {
    return {
      success: false,
      errors: schemaErrors,
    };
  }

  // 6. Selectability evaluation
  const people: ConsentedPerson[] = validatedRows.map((row) => {
    const selectability = evaluateSelectability(
      row.is_minor,
      row.consent_expires_at || undefined,
      {
        referenceTime: options?.referenceTime,
        listValidUntil: row.list_valid_until,
      }
    );

    return {
      projectId: row.project_id,
      projectName: row.project_name,
      personId: row.person_id,
      consentId: row.consent_id,
      displayName: row.display_name,
      contactHint: row.contact_hint || undefined,
      consentExpiresAt: row.consent_expires_at || undefined,
      isMinor: row.is_minor,
      listGeneratedAt: row.list_generated_at,
      listValidUntil: row.list_valid_until,
      isSelectable: selectability.isSelectable,
      nonSelectableReason: selectability.reason,
      formattedReason: selectability.formattedReason,
    };
  });

  const totalCount = people.length;
  const selectableCount = people.filter((p) => p.isSelectable).length;

  const firstPerson = people[0];
  const result: ConsentedListResult = {
    projectId: firstProject,
    projectName: firstPerson?.projectName ?? '',
    listGeneratedAt: firstPerson?.listGeneratedAt ?? '',
    listValidUntil: firstPerson?.listValidUntil ?? '',
    people,
    totalCount,
    selectableCount,
  };

  return {
    success: true,
    data: result,
  };
}
