import Papa from 'papaparse';
import type { ConsentedListResult } from '../list';
import { EXPORT_COLUMN_ORDER, type ExportCsvRow } from '../validation';
import type { AssetTagState } from '../tagging';
import type { ExportSheetBuildResult, FilenamePiiWarning } from './types';

export function generateUuidV4(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().toLowerCase();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function formatExportedAt(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function buildExportFileName(collectionRef: string, exportedAt: Date): string {
  const safeRef = collectionRef.trim().replace(/[/\\:*?"<>|]/g, '_');
  const timestamp = exportedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return `asset_export_${safeRef}_${timestamp}.csv`;
}

export function buildExportRows(
  assets: AssetTagState[],
  consentedList: ConsentedListResult,
  exportId: string,
  exportedAt: string,
  collectionRef: string
): ExportCsvRow[] {
  const rows: ExportCsvRow[] = [];
  const consentByPersonId = new Map(
    consentedList.people.map((person) => [person.personId, person.consentId])
  );
  const common = (asset: AssetTagState) => ({
    export_id: exportId,
    exported_at: exportedAt,
    collection_ref: collectionRef,
    project_id: consentedList.projectId,
    asset_id: asset.assetId,
    asset_type: asset.assetType,
    captured_at: asset.capturedAt,
    content_sha256: asset.sha256 ?? '',
  });

  for (const asset of assets) {
    const base = common(asset);
    if (asset.state === 'deleted') {
      rows.push({
        ...base,
        row_type: 'deleted',
        person_id: '',
        consent_id: '',
        bystander_count: '',
      });
      continue;
    }

    if (asset.noPerson && asset.personIds.length === 0 && asset.bystanderCount === 0) {
      rows.push({
        ...base,
        row_type: 'no_person',
        person_id: '',
        consent_id: '',
        bystander_count: '',
      });
      continue;
    }

    if (asset.personIds.length > 0 || asset.bystanderCount > 0) {
      for (const personId of asset.personIds) {
        rows.push({
          ...base,
          row_type: 'person',
          person_id: personId,
          consent_id: consentByPersonId.get(personId) ?? '',
          bystander_count: '',
        });
      }

      if (asset.bystanderCount > 0) {
        rows.push({
          ...base,
          row_type: 'bystander',
          person_id: '',
          consent_id: '',
          bystander_count: String(asset.bystanderCount),
        });
      }
      continue;
    }

    rows.push({
      ...base,
      row_type: '',
      person_id: '',
      consent_id: '',
      bystander_count: '',
    });
  }

  return rows;
}

export function buildExportSheet(
  assets: AssetTagState[],
  consentedList: ConsentedListResult,
  collectionRef: string,
  exportedAt = new Date(),
  exportId = generateUuidV4()
): ExportSheetBuildResult {
  const timestamp = formatExportedAt(exportedAt);
  const trimmedCollectionRef = collectionRef.trim();
  const rows = buildExportRows(
    assets,
    consentedList,
    exportId,
    timestamp,
    trimmedCollectionRef
  );
  const csvText = Papa.unparse(
    { fields: [...EXPORT_COLUMN_ORDER], data: rows },
    { newline: '\n' }
  );

  return {
    exportId,
    exportedAt: timestamp,
    collectionRef: trimmedCollectionRef,
    fileName: buildExportFileName(trimmedCollectionRef, exportedAt),
    csvText,
    rows,
    heldAssets: [...new Set(
      rows.filter((row) => row.row_type === 'bystander').map((row) => row.asset_id)
    )],
    missingHashAssets: [
      ...new Set(assets.filter((asset) => asset.state === 'active' && !asset.sha256).map((asset) => asset.assetId)),
    ],
    fileDateAssets: [
      ...new Set(
        assets
          .filter((asset) => asset.state === 'active' && asset.captureTimeSource === 'last_modified')
          .map((asset) => asset.assetId)
      ),
    ],
  };
}

export async function writeExportSheetToDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
  csvText: string
): Promise<void> {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(csvText);
  await writable.close();
}

export function triggerCsvDownload(fileName: string, csvText: string): void {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectFilenamePiiWarnings(
  assets: AssetTagState[],
  consentedList: ConsentedListResult
): FilenamePiiWarning[] {
  const activeAssets = assets.filter((asset) => asset.state === 'active');
  const warnings: FilenamePiiWarning[] = [];

  for (const asset of activeAssets) {
    const containsName = consentedList.people.some((person) => {
      const name = person.displayName.trim();
      if (!name) return false;
      const expression = new RegExp(
        `(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}($|[^\\p{L}\\p{N}])`,
        'iu'
      );
      return expression.test(asset.assetId);
    });
    if (containsName) {
      warnings.push({
        assetId: asset.assetId,
        message: 'This asset filename may identify a participant.',
      });
    }
  }
  return warnings;
}
