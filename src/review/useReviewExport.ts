import { useCallback, useMemo, useRef, useState } from 'react';
import type { ConsentedListResult } from '../list';
import type { ProgressSaveEntry } from '../folder';
import type { AssetTagState } from '../tagging';
import { isAssetDone } from '../tagging';
import {
  validateExportWithConsentedList,
  type ValidationFinding,
} from '../validation';
import {
  buildExportSheet,
  detectFilenamePiiWarnings,
  triggerCsvDownload,
  writeExportSheetToDirectory,
} from './sheetWriter';
import type {
  ReviewCandidate,
  ReviewErrorItem,
  ReviewSummaryMetrics,
  SaveSheetResult,
} from './types';

export interface UseReviewExportInput {
  assets: AssetTagState[];
  consentedList: ConsentedListResult;
  collectionRef: string;
  directoryHandle: FileSystemDirectoryHandle;
  hashingCompleted: boolean;
  recordSave: (entry: ProgressSaveEntry) => Promise<void>;
}

function sanitizeFindingMessage(
  message: string,
  consentedList: ConsentedListResult
): string {
  let safeMessage = message;
  for (const person of consentedList.people) {
    for (const privateValue of [person.displayName, person.contactHint ?? '']) {
      const value = privateValue.trim();
      if (value) {
        safeMessage = safeMessage.replace(new RegExp(escapeRegExp(value), 'giu'), 'participant');
      }
    }
  }
  return safeMessage;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toReviewItem(
  finding: ValidationFinding,
  index: number,
  source: ReviewErrorItem['source'],
  consentedList: ConsentedListResult
): ReviewErrorItem {
  return {
    key: `${source}-${finding.code}-${finding.line ?? 'none'}-${finding.assetId ?? index}-${index}`,
    code: finding.code,
    message: sanitizeFindingMessage(finding.message, consentedList),
    assetId: finding.assetId,
    line: finding.line,
    source,
  };
}

function contentSignature(rows: ReturnType<typeof buildExportSheet>['rows']): string {
  return JSON.stringify(
    rows.map(({ export_id: _exportId, exported_at: _exportedAt, ...row }) => row)
  );
}

function getMetrics(
  assets: AssetTagState[],
  rowCount: number,
  heldAssetsCount: number,
  notDoneAssetsCount: number,
  unhashedAssetsCount: number
): ReviewSummaryMetrics {
  const countsByType: ReviewSummaryMetrics['countsByType'] = {
    image: 0,
    video: 0,
    audio: 0,
    sensor: 0,
    document: 0,
    other: 0,
  };
  const uniquePeople = new Set<string>();
  let personTagRows = 0;
  for (const asset of assets) {
    countsByType[asset.assetType]++;
    if (asset.state === 'active') {
      personTagRows += asset.personIds.length;
      for (const personId of asset.personIds) uniquePeople.add(personId);
    }
  }
  return {
    totalAssets: assets.length,
    deletedAssets: assets.filter((asset) => asset.state === 'deleted').length,
    exportRowCount: rowCount,
    personTagRows,
    uniquePeopleTagged: uniquePeople.size,
    heldAssetsCount,
    notDoneAssetsCount,
    unhashedAssetsCount,
    countsByType,
  };
}

export function useReviewExport({
  assets,
  consentedList,
  collectionRef,
  directoryHandle,
  hashingCompleted,
  recordSave,
}: UseReviewExportInput): ReviewCandidate {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<SaveSheetResult | null>(null);
  const lastSavedSignatureRef = useRef<string | null>(null);

  const sheet = useMemo(
    () => buildExportSheet(assets, consentedList, collectionRef),
    [assets, consentedList, collectionRef]
  );
  const report = useMemo(
    () => validateExportWithConsentedList(consentedList, sheet.csvText, new Date()),
    [consentedList, sheet.csvText]
  );
  const notDoneAssets = useMemo(
    () => assets.filter((asset) => !isAssetDone(asset)),
    [assets]
  );
  const readinessErrors = useMemo(
    () =>
      notDoneAssets
        .filter((asset) => !report.errors.some((finding) => finding.assetId === asset.assetId))
        .map((asset, index) => ({
          key: `readiness-NOT_DONE-${asset.assetId}-${index}`,
          code: 'NOT_DONE',
          message:
            asset.personIds.length === 0 && asset.bystanderCount > 0
              ? 'A bystander-only asset must be deleted before export.'
              : 'This asset has not been fully reviewed and tagged.',
          assetId: asset.assetId,
          source: 'readiness' as const,
        })),
    [notDoneAssets, report.errors]
  );
  const errors = useMemo(
    () => [
      ...report.errors.map((finding, index) =>
        toReviewItem(finding, index, 'validator', consentedList)
      ),
      ...readinessErrors,
    ],
    [consentedList, readinessErrors, report.errors]
  );
  const warnings = useMemo(
    () =>
      report.warnings.map((finding, index) =>
        toReviewItem(finding, index, 'validator', consentedList)
      ),
    [consentedList, report.warnings]
  );
  const filenameWarnings = useMemo(
    () => detectFilenamePiiWarnings(assets, consentedList),
    [assets, consentedList]
  );
  const metrics = useMemo(
    () =>
      getMetrics(
        assets,
        sheet.rows.length,
        sheet.heldAssets.length,
        notDoneAssets.length,
        sheet.missingHashAssets.length
      ),
    [
      assets,
      notDoneAssets.length,
      sheet.heldAssets.length,
      sheet.missingHashAssets.length,
      sheet.rows.length,
    ]
  );
  const currentSignature = useMemo(() => contentSignature(sheet.rows), [sheet.rows]);
  const canSave =
    report.errors.length === 0 &&
    notDoneAssets.length === 0 &&
    hashingCompleted &&
    sheet.missingHashAssets.length === 0 &&
    collectionRef.trim().length > 0 &&
    !isSaving;
  const canDownload =
    (lastSaved !== null && lastSavedSignatureRef.current === currentSignature) ||
    (report.valid &&
      notDoneAssets.length === 0 &&
      hashingCompleted &&
      sheet.missingHashAssets.length === 0 &&
      collectionRef.trim().length > 0);

  const saveSheet = useCallback(async (): Promise<SaveSheetResult> => {
    if (isSaving) {
      return {
        saved: false,
        fileName: '',
        exportId: '',
        savedAt: '',
        csvText: '',
        heldAssets: [],
        error: 'A sheet save is already in progress.',
      };
    }

    setIsSaving(true);
    setSaveError(null);
    let written = false;
    const freshSheet = buildExportSheet(assets, consentedList, collectionRef);
    const validation = validateExportWithConsentedList(
      consentedList,
      freshSheet.csvText,
      new Date()
    );
    if (
      validation.errors.length > 0 ||
      notDoneAssets.length > 0 ||
      !hashingCompleted ||
      freshSheet.missingHashAssets.length > 0 ||
      !collectionRef.trim()
    ) {
      const error = 'The sheet is not ready to save. Resolve the listed issues and try again.';
      setSaveError(error);
      setIsSaving(false);
      return {
        saved: false,
        fileName: freshSheet.fileName,
        exportId: freshSheet.exportId,
        savedAt: freshSheet.exportedAt,
        csvText: freshSheet.csvText,
        heldAssets: freshSheet.heldAssets,
        error,
      };
    }

    try {
      await writeExportSheetToDirectory(
        directoryHandle,
        freshSheet.fileName,
        freshSheet.csvText
      );
      written = true;
      const entry: ProgressSaveEntry = {
        export_id: freshSheet.exportId,
        file: freshSheet.fileName,
        saved_at: freshSheet.exportedAt,
        held: freshSheet.heldAssets,
      };
      await recordSave(entry);
      const result: SaveSheetResult = {
        saved: true,
        fileName: freshSheet.fileName,
        exportId: freshSheet.exportId,
        savedAt: freshSheet.exportedAt,
        csvText: freshSheet.csvText,
        heldAssets: freshSheet.heldAssets,
      };
      lastSavedSignatureRef.current = contentSignature(freshSheet.rows);
      setLastSaved(result);
      return result;
    } catch {
      const error = written
        ? 'The sheet was written, but progress could not be updated.'
        : 'Could not write the sheet to the selected collection folder.';
      setSaveError(error);
      if (written) {
        const result: SaveSheetResult = {
          saved: true,
          fileName: freshSheet.fileName,
          exportId: freshSheet.exportId,
          savedAt: freshSheet.exportedAt,
          csvText: freshSheet.csvText,
          heldAssets: freshSheet.heldAssets,
          error,
        };
        lastSavedSignatureRef.current = contentSignature(freshSheet.rows);
        setLastSaved(result);
      }
      return {
        saved: written,
        fileName: freshSheet.fileName,
        exportId: freshSheet.exportId,
        savedAt: freshSheet.exportedAt,
        csvText: freshSheet.csvText,
        heldAssets: freshSheet.heldAssets,
        error,
      };
    } finally {
      setIsSaving(false);
    }
  }, [
    assets,
    collectionRef,
    consentedList,
    directoryHandle,
    hashingCompleted,
    isSaving,
    notDoneAssets.length,
    recordSave,
  ]);

  const downloadCopy = useCallback((): boolean => {
    if (lastSaved && lastSavedSignatureRef.current === currentSignature) {
      triggerCsvDownload(lastSaved.fileName, lastSaved.csvText);
      return true;
    }
    const downloadSheet = buildExportSheet(assets, consentedList, collectionRef);
    const validation = validateExportWithConsentedList(
      consentedList,
      downloadSheet.csvText,
      new Date()
    );
    if (
      validation.errors.length > 0 ||
      notDoneAssets.length > 0 ||
      !hashingCompleted ||
      downloadSheet.missingHashAssets.length > 0 ||
      !collectionRef.trim()
    ) {
      return false;
    }
    triggerCsvDownload(downloadSheet.fileName, downloadSheet.csvText);
    return true;
  }, [
    assets,
    collectionRef,
    consentedList,
    currentSignature,
    hashingCompleted,
    lastSaved,
    notDoneAssets.length,
  ]);

  return {
    sheet,
    errors,
    warnings,
    metrics,
    canSave,
    canDownload,
    filenameWarnings,
    saveSheet,
    downloadCopy,
    isSaving,
    saveError,
    lastSaved,
  };
}
