import { normalizeAssetPath } from '../folder';
import type { ConsentedListResult } from '../list';
import {
  buildExportSheet,
  generateUuidV4,
  triggerCsvDownload,
  writeExportSheetToDirectory,
} from '../review';
import type { AssetTagState } from '../tagging';
import { validateExportWithConsentedList, type ValidationFinding } from '../validation';
import type { CorrectionSheetPreview } from './types';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeFinding(
  finding: ValidationFinding,
  consentedList: ConsentedListResult
): ValidationFinding {
  let message = finding.message;
  for (const person of consentedList.people) {
    for (const privateValue of [person.displayName, person.contactHint ?? '']) {
      const trimmed = privateValue.trim();
      if (trimmed) {
        message = message.replace(new RegExp(escapeRegExp(trimmed), 'giu'), 'participant');
      }
    }
  }
  return { ...finding, message };
}

/**
 * Parses pasted lines or CSV rows into deduplicated, normalized relative `asset_id`s.
 */
export function parseDeletionRequestIds(rawText: string): string[] {
  const tokens = rawText.split(/[\r\n,;]+/);
  const seen = new Set<string>();
  const result: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    let cleaned = (tokens[i] ?? '').trim();
    if (!cleaned) continue;

    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    if (!cleaned) continue;

    // Ignore header line when coordinator loads a 1-column CSV list
    const lower = cleaned.toLowerCase();
    if (result.length === 0 && (lower === 'asset_id' || lower === 'path')) {
      continue;
    }

    const normalized = normalizeAssetPath(cleaned);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

/**
 * Generates a collision-free correction CSV filename under the data contract naming prefix.
 */
export function buildCorrectionFileName(
  collectionRef: string,
  exportedAt: Date,
  existingNames?: ReadonlySet<string>
): string {
  const safeRef = collectionRef.trim().replace(/[/\\:*?"<>|]/g, '_');
  let cursorMs = exportedAt.getTime();

  for (let attempt = 0; attempt < 60; attempt++) {
    const candidateDate = new Date(cursorMs);
    const ts = candidateDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const candidateName = `asset_export_${safeRef}_correction_${ts}.csv`;
    if (!existingNames || !existingNames.has(candidateName)) {
      return candidateName;
    }
    cursorMs += 1000;
  }

  return `asset_export_${safeRef}_correction_${exportedAt.getTime()}.csv`;
}

/**
 * Builds and validates a correction export sheet containing ONLY corrected and deleted assets (R-33).
 */
export function buildCorrectionSheetPreview(
  targetAssets: AssetTagState[],
  consentedList: ConsentedListResult,
  collectionRef: string,
  exportedAt: Date = new Date(),
  exportId: string = generateUuidV4(),
  existingSaveNames?: ReadonlySet<string>
): CorrectionSheetPreview {
  if (targetAssets.length === 0) {
    return {
      fileName: buildCorrectionFileName(collectionRef, exportedAt, existingSaveNames),
      exportId,
      exportedAt: exportedAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      collectionRef: collectionRef.trim(),
      csvText: '',
      rowCount: 0,
      correctedCount: 0,
      deletedCount: 0,
      valid: false,
      errors: [],
      warnings: [],
    };
  }

  const baseSheet = buildExportSheet(
    targetAssets,
    consentedList,
    collectionRef,
    exportedAt,
    exportId
  );
  const fileName = buildCorrectionFileName(
    baseSheet.collectionRef,
    exportedAt,
    existingSaveNames
  );
  const validation = validateExportWithConsentedList(
    consentedList,
    baseSheet.csvText,
    new Date()
  );

  const deletedCount = targetAssets.filter((a) => a.state === 'deleted').length;
  const correctedCount = targetAssets.length - deletedCount;

  return {
    fileName,
    exportId: baseSheet.exportId,
    exportedAt: baseSheet.exportedAt,
    collectionRef: baseSheet.collectionRef,
    csvText: baseSheet.csvText,
    rowCount: baseSheet.rows.length,
    correctedCount,
    deletedCount,
    valid: validation.valid && baseSheet.collectionRef.length > 0,
    errors: validation.errors.map((e) => sanitizeFinding(e, consentedList)),
    warnings: validation.warnings.map((w) => sanitizeFinding(w, consentedList)),
  };
}

export async function writeCorrectionSheetToDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
  csvText: string
): Promise<void> {
  await writeExportSheetToDirectory(directoryHandle, fileName, csvText);
}

export function triggerCorrectionSheetDownload(
  fileName: string,
  csvText: string
): void {
  triggerCsvDownload(fileName, csvText);
}
